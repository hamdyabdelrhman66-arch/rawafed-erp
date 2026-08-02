import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import type { DatabaseClient } from "../repositories/repository.types.js";
import { JournalService } from "./journal.service.js";
import { mappingFor, revenueCategory } from "./revenue-category.js";
import { ServiceError } from "./service.error.js";
import { calculateStudentDiscount, discountMoney, splitInvoiceDiscount, type DiscountType } from "./student-discount.js";
import { vatRateForStudent } from "./student-vat.js";

export interface StudentDiscountInput {
  invoiceId?: string;
  discountType: DiscountType;
  discountValue: number;
  reason: string;
  notes?: string;
  effectiveDate: string;
  approvalReference?: string;
  source?: string;
  idempotencyKey: string;
}

const approvedWhere = { status: "APPROVED" as const };

const discountShape = (row: any) => ({
  id: row.id,
  studentId: row.studentId,
  accountId: row.accountId,
  invoiceId: row.invoiceId,
  discountType: row.discountType,
  discountValue: Number(row.discountValue),
  calculatedAmount: Number(row.calculatedAmount),
  baseAmount: Number(row.baseAmount),
  vatAmount: Number(row.vatAmount),
  governmentBorneVat: Number(row.governmentBorneVat),
  reason: row.reason,
  notes: row.notes,
  effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
  status: row.status,
  approvalReference: row.approvalReference,
  creditNoteNumber: row.creditNoteNumber,
  paymentId: row.paymentId,
  journalEntryId: row.journalEntryId,
  reversalJournalId: row.reversalJournalId,
  requestedBy: row.requestedBy ? { id: row.requestedBy.id, displayName: row.requestedBy.displayName } : null,
  approvedBy: row.approvedBy ? { id: row.approvedBy.id, displayName: row.approvedBy.displayName } : null,
  approvedAt: row.approvedAt?.toISOString() || null,
  rejectedAt: row.rejectedAt?.toISOString() || null,
  cancelledAt: row.cancelledAt?.toISOString() || null,
  createdAt: row.createdAt.toISOString(),
});

const includeShape = {
  requestedBy: { select: { id: true, displayName: true } },
  approvedBy: { select: { id: true, displayName: true } },
} as const;

async function hasPermission(db: DatabaseClient, actor: Actor, code: string) {
  if (actor.role === "Super Admin") return true;
  if (!actor.role) return false;
  return Boolean(await db.rolePermission.findFirst({
    where: { role: { name: actor.role }, permission: { code } },
    select: { roleId: true },
  }));
}

async function assertBranchScope(db: DatabaseClient, branchId: string, actor: Actor) {
  if (!actor.id || actor.role === "Super Admin") return;
  const setting = await db.setting.findUnique({ where: { key: "user_branch_scopes" } });
  const scopes = (setting?.value || {}) as Record<string, unknown>;
  const allowed = Array.isArray(scopes[actor.id]) ? scopes[actor.id] as string[] : null;
  if (allowed && !allowed.includes(branchId))
    throw new ServiceError("ليس لديك صلاحية على فرع هذا الطالب.", 403, "STUDENT_BRANCH_ACCESS_DENIED");
}

async function accountState(db: DatabaseClient, accountId: string) {
  const account = await db.financeAccount.findFirst({
    where: { id: accountId, deletedAt: null },
    include: {
      student: true,
      registration: true,
      payments: { where: { status: "COMPLETED", deletedAt: null } },
      discounts: { where: approvedWhere },
    },
  });
  if (!account) throw new ServiceError("حساب الطالب المالي غير موجود.", 404, "STUDENT_PAYMENT_ACCOUNT_NOT_FOUND");
  const grossFees = discountMoney(account.expectedTotal);
  const totalDiscounts = discountMoney(account.discounts.reduce((sum, row) => sum + Number(row.calculatedAmount), 0));
  const totalPaid = discountMoney(account.payments.reduce((sum, row) => sum + Number(row.amount), 0));
  return { account, grossFees, totalDiscounts, totalPaid, netFees: discountMoney(grossFees - totalDiscounts), outstandingBalance: discountMoney(Math.max(grossFees - totalDiscounts - totalPaid, 0)) };
}

function translateCalculationError(error: unknown): never {
  const code = String((error as Error)?.message || "");
  if (code === "DISCOUNT_VALUE_REQUIRED") throw new ServiceError("يجب إدخال قيمة الخصم.", 422, code);
  if (code === "DISCOUNT_PERCENTAGE_INVALID") throw new ServiceError("يجب أن تكون نسبة الخصم أكبر من صفر ولا تتجاوز 100%.", 422, code);
  if (code.includes("EXCEEDS")) throw new ServiceError("قيمة الخصم أكبر من المبلغ المتاح للخصم.", 422, "DISCOUNT_EXCEEDS_AVAILABLE_BALANCE");
  throw error;
}

async function adjustInstallments(db: DatabaseClient, customerId: string | undefined, amount: number, reverse = false) {
  if (!customerId || !amount) return;
  const plan = await db.installmentPlan.findFirst({
    where: { customerId, active: true, deletedAt: null },
    include: { installments: { orderBy: { dueDate: "desc" } } },
  });
  if (!plan) return;
  if (reverse) {
    const target = plan.installments.find(row => Number(row.amount) > Number(row.paidAmount)) || plan.installments[0];
    if (target) await db.installment.update({ where: { id: target.id }, data: { amount: discountMoney(Number(target.amount) + amount) } });
    await db.installmentPlan.update({ where: { id: plan.id }, data: { totalAmount: discountMoney(Number(plan.totalAmount) + amount) } });
    return;
  }
  let remaining = discountMoney(amount);
  for (const row of plan.installments) {
    if (remaining <= 0) break;
    const available = discountMoney(Math.max(Number(row.amount) - Number(row.paidAmount), 0));
    const reduction = discountMoney(Math.min(available, remaining));
    if (reduction > 0) await db.installment.update({ where: { id: row.id }, data: { amount: discountMoney(Number(row.amount) - reduction) } });
    remaining = discountMoney(remaining - reduction);
  }
  if (remaining > 0) throw new ServiceError("قيمة الخصم لا تتوافق مع رصيد خطة الأقساط.", 422, "DISCOUNT_INSTALLMENT_MISMATCH");
  await db.installmentPlan.update({ where: { id: plan.id }, data: { totalAmount: discountMoney(Number(plan.totalAmount) - amount) } });
}

async function postingContext(db: DatabaseClient, account: any, invoice: any | null, amount: number) {
  const customer = await db.accountingCustomer.findUnique({ where: { studentId: account.studentId } });
  if (!customer) throw new ServiceError("حساب مدين الطالب غير مهيأ.", 422, "ACCOUNT_MAPPING_MISSING");
  const category = revenueCategory(invoice?.serviceCategory || "TUITION");
  const mapping = await mappingFor(db, category);
  const revenueAccountId = invoice?.lines?.find((line: any) => line.revenueAccountId)?.revenueAccountId || mapping.revenue.id;
  let split = invoice ? splitInvoiceDiscount(amount, invoice) : (() => {
    const rate = vatRateForStudent(account.student.nationalId) / 100;
    const baseAmount = rate ? discountMoney(amount / (1 + rate)) : discountMoney(amount);
    return { baseAmount, vatAmount: discountMoney(amount - baseAmount), governmentBorneVat: 0 };
  })();
  const totalVatReduction = discountMoney(split.vatAmount + split.governmentBorneVat);
  const vatAccount = totalVatReduction ? await db.chartOfAccount.findUnique({ where: { systemKey: "vat-payable" } }) : null;
  const governmentVatAccount = split.governmentBorneVat ? await db.chartOfAccount.findUnique({ where: { systemKey: "government-vat-receivable" } }) : null;
  if ((totalVatReduction && !vatAccount) || (split.governmentBorneVat && !governmentVatAccount))
    throw new ServiceError("حسابات الضريبة المطلوبة غير مهيأة.", 422, "ACCOUNT_MAPPING_MISSING");
  return { customer, mapping, revenueAccountId, split, vatAccount, governmentVatAccount };
}

export async function createStudentDiscountUsing(
  db: DatabaseClient,
  accountId: string,
  input: StudentDiscountInput,
  actor: Actor,
) {
  if (!await hasPermission(db, actor, "student_discount.create"))
    throw new ServiceError("ليس لديك صلاحية إنشاء خصم للطالب.", 403, "PERMISSION_DENIED");
  const existing = await db.studentDiscount.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: includeShape });
  if (existing) {
    if (existing.accountId !== accountId) throw new ServiceError("مفتاح العملية مستخدم لخصم آخر.", 409, "DUPLICATE_DISCOUNT");
    return existing;
  }
  const state = await accountState(db, accountId);
  await assertBranchScope(db, state.account.registration.branchId, actor);
  if (!String(input.reason || "").trim()) throw new ServiceError("يجب توضيح سبب الخصم.", 422, "DISCOUNT_REASON_REQUIRED");
  let calculation;
  try {
    calculation = calculateStudentDiscount({
      grossFees: state.grossFees,
      previousDiscounts: state.totalDiscounts,
      totalPaid: state.totalPaid,
      discountType: input.discountType,
      discountValue: input.discountValue,
    });
  } catch (error) { translateCalculationError(error); }
  const invoice = input.invoiceId
    ? await db.financeInvoice.findFirst({ where: { id: input.invoiceId, accountId, deletedAt: null, status: { not: "VOID" } }, include: { lines: true, payments: { where: { payment: { status: "COMPLETED", deletedAt: null } } } } })
    : await db.financeInvoice.findFirst({ where: { accountId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, include: { lines: true, payments: { where: { payment: { status: "COMPLETED", deletedAt: null } } } }, orderBy: { issuedAt: "asc" } });
  if (input.invoiceId && !invoice) throw new ServiceError("الفاتورة لا تخص حساب الطالب أو غير متاحة.", 422, "PAYMENT_CONTEXT_INVOICE_MISMATCH");
  const canApprove = await hasPermission(db, actor, "student_discount.approve");
  const status = canApprove ? "APPROVED" : "PENDING_APPROVAL";
  const split = invoice ? splitInvoiceDiscount(calculation!.amount, invoice) : { baseAmount: calculation!.amount, vatAmount: 0, governmentBorneVat: 0 };
  let row = await db.studentDiscount.create({
    data: {
      id: randomUUID(), idempotencyKey: input.idempotencyKey, studentId: state.account.studentId, accountId,
      invoiceId: invoice?.id || null, academicYearId: state.account.registration.academicYearId,
      branchId: state.account.registration.branchId, discountType: input.discountType, discountValue: input.discountValue,
      calculatedAmount: calculation!.amount, baseAmount: split.baseAmount, vatAmount: split.vatAmount,
      governmentBorneVat: split.governmentBorneVat, reason: input.reason.trim(), notes: input.notes || null,
      effectiveDate: new Date(input.effectiveDate), status, source: input.source || "PAYMENT_PAGE",
      approvalReference: input.approvalReference || null, requestedById: actor.id,
      ...(canApprove ? { approvedById: actor.id, approvedAt: new Date() } : {}),
    },
    include: includeShape,
  });
  await new AuditRepository(db).create({ actorId: actor.id, actorRole: actor.role, action: "STUDENT_DISCOUNT_CREATED", entityType: "student_discount", entityId: row.id, details: { studentId: row.studentId, accountId, invoiceId: row.invoiceId, amount: calculation!.amount, status }, idempotencyKey: `discount:create:${row.id}` });
  if (canApprove) row = await applyStudentDiscountApproval(db, row.id, actor);
  return row;
}

async function applyStudentDiscountApproval(db: DatabaseClient, id: string, actor: Actor) {
  const row = await db.studentDiscount.findUnique({ where: { id }, include: { account: { include: { student: { include: { customer: true } }, registration: true } }, invoice: { include: { lines: true, payments: { where: { payment: { status: "COMPLETED", deletedAt: null } } } } }, ...includeShape } });
  if (!row) throw new ServiceError("سجل الخصم غير موجود.", 404, "DISCOUNT_NOT_FOUND");
  if (row.status === "APPROVED" && row.journalEntryId) return row;
  if (!["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(row.status)) throw new ServiceError("لا يمكن اعتماد الخصم في حالته الحالية.", 409, "DISCOUNT_NOT_APPROVABLE");
  const state = await accountState(db, row.accountId);
  const previousWithoutCurrent = state.totalDiscounts - (row.status === "APPROVED" ? Number(row.calculatedAmount) : 0);
  try {
    calculateStudentDiscount({ grossFees: state.grossFees, previousDiscounts: previousWithoutCurrent, totalPaid: state.totalPaid, discountType: "FIXED", discountValue: Number(row.calculatedAmount) });
  } catch (error) { translateCalculationError(error); }
  const context = await postingContext(db, row.account, row.invoice, Number(row.calculatedAmount));
  const creditNoteNumber = row.creditNoteNumber || (row.invoice ? `CN-${new Date(row.effectiveDate).getUTCFullYear()}-${row.id.slice(0, 8).toUpperCase()}` : null);
  const outbox = await db.accountingOutbox.upsert({
    where: { eventType_aggregateId: { eventType: "STUDENT_DISCOUNT_APPROVED", aggregateId: row.id } },
    update: {},
    create: { eventType: "STUDENT_DISCOUNT_APPROVED", aggregateType: "student_discount", aggregateId: row.id, payload: { discountId: row.id, studentId: row.studentId, invoiceId: row.invoiceId, amount: Number(row.calculatedAmount), branchId: row.branchId, academicYearId: row.academicYearId } },
  });
  const journal = await JournalService.postUsing(db, {
    branchId: row.branchId, academicYearId: row.academicYearId || undefined,
    postingDate: row.effectiveDate, description: `Student discount ${creditNoteNumber || row.id}`,
    referenceNumber: creditNoteNumber || row.approvalReference || row.id,
    sourceType: "student_discount", sourceId: row.id, sourceModule: "finance",
    postingEventType: "STUDENT_DISCOUNT_APPROVED", invoiceId: row.invoiceId || undefined,
    lines: [
      { accountId: context.revenueAccountId, debit: context.split.baseAmount, costCenterId: context.mapping.costCenterId || undefined },
      ...(context.split.vatAmount + context.split.governmentBorneVat ? [{ accountId: context.vatAccount!.id, debit: discountMoney(context.split.vatAmount + context.split.governmentBorneVat), costCenterId: context.mapping.costCenterId || undefined }] : []),
      { accountId: context.customer.receivableAccountId, credit: Number(row.calculatedAmount), costCenterId: context.mapping.costCenterId || undefined },
      ...(context.split.governmentBorneVat ? [{ accountId: context.governmentVatAccount!.id, credit: context.split.governmentBorneVat, costCenterId: context.mapping.costCenterId || undefined }] : []),
    ],
  }, actor);
  await adjustInstallments(db, row.account.student.customer?.id, Number(row.calculatedAmount));
  if (row.invoice) {
    const paid = discountMoney(row.invoice.payments.reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0));
    const invoiceDiscounts = await db.studentDiscount.aggregate({ where: { invoiceId: row.invoiceId!, status: "APPROVED", id: { not: row.id } }, _sum: { calculatedAmount: true } });
    const settled = discountMoney(paid + Number(invoiceDiscounts._sum.calculatedAmount || 0) + Number(row.calculatedAmount)) >= discountMoney(row.invoice.total);
    await db.financeInvoice.update({ where: { id: row.invoice.id }, data: { status: settled ? "PAID" : "PARTIALLY_PAID" } });
  }
  const updated = await db.studentDiscount.update({ where: { id }, data: {
    status: "APPROVED", approvedById: actor.id, approvedAt: row.approvedAt || new Date(),
    creditNoteNumber, journalEntryId: journal.id, baseAmount: context.split.baseAmount,
    vatAmount: context.split.vatAmount, governmentBorneVat: context.split.governmentBorneVat,
  }, include: includeShape });
  await db.accountingOutbox.update({ where: { id: outbox.id }, data: { processedAt: new Date() } });
  await new AuditRepository(db).create({ actorId: actor.id, actorRole: actor.role, action: "STUDENT_DISCOUNT_APPROVED", entityType: "student_discount", entityId: id, oldValues: { status: row.status } as any, newValues: { status: "APPROVED", amount: Number(row.calculatedAmount), journalEntryId: journal.id, creditNoteNumber } as any, changedFields: ["status", "approvedById", "approvedAt", "journalEntryId"], details: { studentId: row.studentId, invoiceId: row.invoiceId, branchId: row.branchId, academicYearId: row.academicYearId }, idempotencyKey: `discount:approve:${id}` });
  return updated;
}

export class StudentDiscountService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(studentId: string, actor: Actor) {
    const account = await this.prisma.financeAccount.findFirst({ where: { studentId, deletedAt: null }, include: { registration: true } });
    if (!account) throw new ServiceError("حساب الطالب المالي غير موجود.", 404, "STUDENT_PAYMENT_ACCOUNT_NOT_FOUND");
    await assertBranchScope(this.prisma, account.registration.branchId, actor);
    return (await this.prisma.studentDiscount.findMany({ where: { studentId }, include: includeShape, orderBy: { createdAt: "desc" } })).map(discountShape);
  }

  async create(studentId: string, input: StudentDiscountInput, actor: Actor) {
    return this.prisma.$transaction(async tx => {
      const account = await tx.financeAccount.findFirst({ where: { studentId, deletedAt: null } });
      if (!account) throw new ServiceError("حساب الطالب المالي غير موجود.", 404, "STUDENT_PAYMENT_ACCOUNT_NOT_FOUND");
      const discount = await createStudentDiscountUsing(tx, account.id, input, actor);
      return { discount: discountShape(discount), studentAccount: await accountState(tx, account.id).then(({ account: _account, ...state }) => state) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }

  async approve(id: string, actor: Actor) {
    if (!await hasPermission(this.prisma, actor, "student_discount.approve")) throw new ServiceError("ليس لديك صلاحية اعتماد الخصومات.", 403, "PERMISSION_DENIED");
    return this.prisma.$transaction(async tx => {
      const discount = await applyStudentDiscountApproval(tx, id, actor);
      return { discount: discountShape(discount), studentAccount: await accountState(tx, discount.accountId).then(({ account: _account, ...state }) => state) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }

  async reject(id: string, reason: string, actor: Actor) {
    if (!await hasPermission(this.prisma, actor, "student_discount.approve")) throw new ServiceError("ليس لديك صلاحية رفض الخصومات.", 403, "PERMISSION_DENIED");
    if (!reason.trim()) throw new ServiceError("يجب توضيح سبب الرفض.", 422, "DISCOUNT_REASON_REQUIRED");
    return this.prisma.$transaction(async tx => {
      const current = await tx.studentDiscount.findUnique({ where: { id } });
      if (!current) throw new ServiceError("سجل الخصم غير موجود.", 404, "DISCOUNT_NOT_FOUND");
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(current.status)) throw new ServiceError("لا يمكن رفض الخصم في حالته الحالية.", 409, "DISCOUNT_NOT_REJECTABLE");
      const row = await tx.studentDiscount.update({ where: { id }, data: { status: "REJECTED", rejectedById: actor.id, rejectedAt: new Date(), rejectionReason: reason.trim() }, include: includeShape });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "STUDENT_DISCOUNT_REJECTED", entityType: "student_discount", entityId: id, details: { reason }, idempotencyKey: `discount:reject:${id}` });
      return discountShape(row);
    });
  }

  async cancel(id: string, reason: string, actor: Actor) {
    if (!await hasPermission(this.prisma, actor, "student_discount.cancel")) throw new ServiceError("ليس لديك صلاحية إلغاء الخصومات.", 403, "PERMISSION_DENIED");
    if (!reason.trim()) throw new ServiceError("يجب توضيح سبب إلغاء الخصم.", 422, "DISCOUNT_REASON_REQUIRED");
    return this.prisma.$transaction(async tx => {
      const row = await tx.studentDiscount.findUnique({ where: { id }, include: { account: { include: { student: { include: { customer: true } }, registration: true, payments: { where: { status: "COMPLETED", deletedAt: null }, select: { id: true } } } }, invoice: { include: { lines: true, payments: { where: { payment: { status: "COMPLETED", deletedAt: null } } } } }, ...includeShape } });
      if (!row) throw new ServiceError("سجل الخصم غير موجود.", 404, "DISCOUNT_NOT_FOUND");
      if (row.status === "CANCELLED") return { discount: discountShape(row), warning: null };
      if (row.status !== "APPROVED") throw new ServiceError("يمكن إلغاء الخصم المعتمد فقط.", 409, "DISCOUNT_NOT_CANCELLABLE");
      const context = await postingContext(tx, row.account, row.invoice, Number(row.calculatedAmount));
      const journal = await JournalService.postUsing(tx, {
        branchId: row.branchId, academicYearId: row.academicYearId || undefined, postingDate: new Date(),
        description: `Reverse student discount ${row.creditNoteNumber || row.id}`, referenceNumber: row.creditNoteNumber || row.id,
        sourceType: "student_discount_reversal", sourceId: row.id, sourceModule: "finance", postingEventType: "STUDENT_DISCOUNT_CANCELLED", invoiceId: row.invoiceId || undefined,
        lines: [
          { accountId: context.customer.receivableAccountId, debit: Number(row.calculatedAmount), costCenterId: context.mapping.costCenterId || undefined },
          ...(context.split.governmentBorneVat ? [{ accountId: context.governmentVatAccount!.id, debit: context.split.governmentBorneVat, costCenterId: context.mapping.costCenterId || undefined }] : []),
          { accountId: context.revenueAccountId, credit: context.split.baseAmount, costCenterId: context.mapping.costCenterId || undefined },
          ...(context.split.vatAmount + context.split.governmentBorneVat ? [{ accountId: context.vatAccount!.id, credit: discountMoney(context.split.vatAmount + context.split.governmentBorneVat), costCenterId: context.mapping.costCenterId || undefined }] : []),
        ],
      }, actor);
      await adjustInstallments(tx, row.account.student.customer?.id, Number(row.calculatedAmount), true);
      if (row.invoice) {
        const paid = discountMoney(row.invoice.payments.reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0));
        const other = await tx.studentDiscount.aggregate({ where: { invoiceId: row.invoiceId!, status: "APPROVED", id: { not: row.id } }, _sum: { calculatedAmount: true } });
        await tx.financeInvoice.update({ where: { id: row.invoice.id }, data: { status: paid + Number(other._sum.calculatedAmount || 0) >= Number(row.invoice.total) ? "PAID" : paid > 0 || Number(other._sum.calculatedAmount || 0) > 0 ? "PARTIALLY_PAID" : "ISSUED" } });
      }
      const updated = await tx.studentDiscount.update({ where: { id }, data: { status: "CANCELLED", cancelledById: actor.id, cancelledAt: new Date(), cancellationReason: reason.trim(), reversalJournalId: journal.id }, include: includeShape });
      const outbox = await tx.accountingOutbox.upsert({ where: { eventType_aggregateId: { eventType: "STUDENT_DISCOUNT_CANCELLED", aggregateId: id } }, update: { processedAt: new Date() }, create: { eventType: "STUDENT_DISCOUNT_CANCELLED", aggregateType: "student_discount", aggregateId: id, payload: { discountId: id, reversalJournalId: journal.id }, processedAt: new Date() } });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "STUDENT_DISCOUNT_CANCELLED", entityType: "student_discount", entityId: id, oldValues: { status: "APPROVED" } as any, newValues: { status: "CANCELLED", reversalJournalId: journal.id } as any, changedFields: ["status", "cancelledById", "cancelledAt", "reversalJournalId"], details: { reason, outboxId: outbox.id }, idempotencyKey: `discount:cancel:${id}` });
      return { discount: discountShape(updated), warning: row.account.payments.length ? "تم إلغاء الخصم بعد وجود دفعات؛ تمت إعادة احتساب الرصيد." : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }
}

export { accountState as studentAccountFinancialState, discountShape as shapeStudentDiscount };

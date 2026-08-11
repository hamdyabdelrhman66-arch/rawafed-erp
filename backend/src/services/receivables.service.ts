import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AccountingPaymentsRepository } from "../repositories/accounting-expenses.repository.js";
import { CustomersRepository } from "../repositories/parties.repository.js";
import { InstallmentsRepository } from "../repositories/installments.repository.js";
import { LedgerRepository } from "../repositories/ledger.repository.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";
import { allocateInstallmentPayment, installmentStatus } from "./installment-allocation.service.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { calculateFeePreview, normalizeManualTaxIdentity } from "./student-vat.js";

export class ReceivablesService {
  constructor(private readonly prisma: PrismaClient) {}
  async list() {
    return (await this.customerRows()).map((customer) =>
      this.shapeCustomer(customer),
    );
  }
  async get(id: string) {
    const row = (await this.customerRows(id))[0];
    if (!row) throw new ServiceError("Customer not found.", 404);
    return this.shapeCustomer(row);
  }
  async createManualCustomer(input: any, actor: Actor) {
    const created = await this.prisma.$transaction(async (tx) => {
      const taxIdentity = normalizeManualTaxIdentity({
        identityType: input.identityType,
        identityNumber: input.nationalId,
        nationality: input.nationality,
      });
      const academicYear = await tx.academicYear.findFirst({
        where: { active: true, deletedAt: null, branch: { active: true, deletedAt: null } },
        include: { branch: true },
        orderBy: { startsAt: "desc" },
      });
      const branch = academicYear?.branch || await tx.branch.findFirst({
        where: { active: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
      if (!branch) throw new ServiceError("No active branch is configured. / لا يوجد فرع نشط مُعد في النظام.", 422, "BRANCH_NOT_CONFIGURED");
      const duplicateIdentity = await tx.student.findUnique({ where: { nationalId: input.nationalId }, select: { id: true } });
      if (duplicateIdentity) throw new ServiceError("The identity number is already registered. / رقم الهوية مسجل بالفعل.", 409, "DUPLICATE_IDENTITY");

      const policies = await tx.revenueCategoryMapping.findMany({ where: { active: true } });
      const preview = calculateFeePreview(
        taxIdentity,
        input.fees.map((fee: any) => ({ name: fee.name, category: fee.category, amount: fee.amount })),
        policies,
      );
      if (!preview.lines.length || preview.parentPayableTotal <= 0)
        throw new ServiceError("At least one valid fee is required. / يجب إدخال بند مصروفات واحد صحيح على الأقل.", 422, "FEES_REQUIRED");

      const parent = await tx.chartOfAccount.findUnique({ where: { systemKey: "accounts-receivable" } });
      if (!parent) throw new ServiceError("Accounts receivable control account is not configured.", 422, "ACCOUNT_MAPPING_MISSING");
      const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
      const year = new Date().getUTCFullYear();
      const typePrefix = input.customerType === "WORKER" ? "WRK" : "CHD";
      const registrationNumber = `${typePrefix}-${year}-${suffix}`;
      const profile = {
        source: "MANUAL_FINANCE_CUSTOMER",
        customerType: input.customerType,
        student: {
          identityType: taxIdentity.identityType,
          nationalId: taxIdentity.identityNumber,
          nationality: taxIdentity.nationality,
          manualCustomerType: input.customerType,
        },
        worker: input.customerType === "WORKER" ? { position: input.position, department: input.department } : undefined,
        guardian: input.customerType === "CHILD" ? { name: input.guardianName, phone: input.guardianPhone } : undefined,
        financial: {
          paymentPlan: "FULL",
          fees: preview.lines.map((line) => ({ name: line.name, category: line.category, subtotal: line.subtotal, vat: line.chargedVat, total: line.parentPayable })),
        },
        notes: input.notes || undefined,
      };
      const registration = await tx.registration.create({
        data: {
          registrationNumber,
          branchId: branch.id,
          academicYearId: academicYear?.id,
          status: "approved",
          studentName: input.nameEn,
          grade: input.customerType === "WORKER" ? input.position : input.grade,
          submittedAt: new Date(),
          data: profile as Prisma.InputJsonValue,
        },
      });
      const student = await tx.student.create({
        data: {
          registrationId: registration.id,
          registrationNumber,
          branchId: branch.id,
          englishName: input.nameEn,
          arabicName: input.nameAr,
          grade: input.customerType === "WORKER" ? (input.position || "Worker") : input.grade,
          nationalId: taxIdentity.identityNumber,
          parentName: input.customerType === "CHILD" ? input.guardianName : undefined,
          parentPhone: input.customerType === "CHILD" ? input.guardianPhone : input.phone,
          parentEmail: input.email || undefined,
          profile: profile as Prisma.InputJsonValue,
        },
      });
      const receivable = await tx.chartOfAccount.create({
        data: {
          code: `${parent.code}-M${suffix}`,
          name: `AR - ${input.nameEn}`,
          nameAr: `ذمم - ${input.nameAr}`,
          type: "ASSET",
          parentId: parent.id,
          isReceivableAccount: true,
          allowPosting: true,
          allowManualJournal: true,
        },
      });
      await tx.financeAccount.create({
        data: {
          registrationId: registration.id,
          studentId: student.id,
          expectedTotal: preview.parentPayableTotal,
          feeItems: {
            create: preview.lines.map((line) => ({
              name: line.name,
              serviceCategory: line.category,
              subtotal: line.subtotal,
              vatAmount: line.chargedVat,
              vatRate: line.vatRate,
              governmentBorneVat: line.governmentBorneAmount,
              taxTreatment: line.treatment,
              taxReason: line.reasonCode,
              amount: line.parentPayable,
            })),
          },
        },
      });
      const customer = await tx.accountingCustomer.create({
        data: {
          customerCode: `CUS-${typePrefix}-${suffix}`,
          studentId: student.id,
          registrationId: registration.id,
          registrationNumber,
          parentLink: input.customerType === "CHILD" ? input.guardianName : input.position,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          phone: input.phone,
          email: input.email || undefined,
          nationalId: taxIdentity.identityNumber,
          receivableAccountId: receivable.id,
          notes: input.notes,
        },
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create manual finance customer",
        entityType: "accounting_customer",
        entityId: customer.id,
        riskLevel: "MEDIUM",
        newValues: { customerType: input.customerType, registrationNumber, grossFees: preview.parentPayableTotal },
        changedFields: ["customer", "student", "financeAccount", "feeItems", "receivableAccount"],
      });
      return customer.id;
    });
    return this.get(created);
  }
  async statement(id: string, from?: string, to?: string) {
    const customer = await new CustomersRepository(this.prisma).find(id);
    if (!customer) throw new ServiceError("Customer not found.", 404);
    const statement = await new (
      await import("./financial-statements.service.js")
    ).FinancialStatementsService(this.prisma).ledger(
      customer.receivableAccountId,
      from,
      to,
    );
    return {
      ...statement,
      transactions: statement.entries.map((entry: any) => ({
        ...entry,
        date: entry.postingDate,
      })),
    };
  }
  async installments(id: string) {
    await this.get(id);
    const [plans, installments] = await Promise.all([
      this.prisma.installmentPlan.findMany({
        where: { customerId: id, deletedAt: null },
        orderBy: { startDate: "desc" },
      }),
      new InstallmentsRepository(this.prisma).list(id),
    ]);
    return {
      plans: plans.map((plan) => ({
        ...plan,
        totalAmount: Number(plan.totalAmount),
        lateFeeValue: Number(plan.lateFeeValue),
        startDate: plan.startDate.toISOString().slice(0, 10),
      })),
      installments: installments.map((installment) => ({
        ...installment,
        amount: Number(installment.amount),
        paidAmount: Number(installment.paidAmount),
        dueDate: installment.dueDate.toISOString().slice(0, 10),
        status: installmentStatus(installment),
      })),
    };
  }
  async createPlan(customerId: string, input: any, actor: Actor) {
    const customer = await this.get(customerId);
    const total = Math.round(Number(customer.summary.outstanding) * 100) / 100;
    if (total <= 0) throw new ServiceError("Customer has no outstanding balance to schedule.", 422, "NO_OUTSTANDING_BALANCE");
    const planType = String(input.planType || "CUSTOM").toUpperCase();
    const start = new Date(input.startDate || Date.now());
    if (Number.isNaN(start.getTime())) throw new ServiceError("A valid installment start date is required.", 422, "VALIDATION_ERROR");
    let requested = Array.isArray(input.installments) ? input.installments : [];
    const requestedCount = Number(input.installmentsCount || input.count || requested.length);
    const count = planType === "FULL" ? 1 : planType === "FIFTY_FIFTY" ? 2 : requestedCount;
    if (!Number.isInteger(count) || count <= 0) throw new ServiceError("Installment count must be positive.", 422, "VALIDATION_ERROR");
    if (planType !== "CUSTOM" || !requested.length) requested = Array.from({ length: count }, (_, index) => {
      const due = new Date(start);
      due.setUTCMonth(due.getUTCMonth() + index);
      return { dueDate: due.toISOString().slice(0, 10) };
    });
    if (requested.length !== count) throw new ServiceError("Installment rows must match the installment count.", 422, "INSTALLMENT_COUNT_MISMATCH");
    let assigned = 0;
    const defaultAmount = Math.floor((total * 100) / count) / 100;
    const rows = requested.map((item: any, index: number) => {
      const dueDate = new Date(item.dueDate);
      if (Number.isNaN(dueDate.getTime())) throw new ServiceError("Every installment requires a valid due date.", 422, "VALIDATION_ERROR");
      let amount = item.percentage != null ? Math.round(total * Number(item.percentage)) / 100 : Number(item.amount ?? defaultAmount);
      if (index === count - 1 && input.autoCalculateFinal !== false) amount = Math.round((total - assigned) * 100) / 100;
      amount = Math.round(amount * 100) / 100;
      if (amount <= 0) throw new ServiceError("Installment amounts must be positive.", 422, "INVALID_INSTALLMENT_AMOUNT");
      assigned = Math.round((assigned + amount) * 100) / 100;
      return { id: randomUUID(), customerId, dueDate, amount, notes: item.notes || null };
    });
    if (assigned !== total) throw new ServiceError("Installment totals must equal the outstanding balance.", 422, "INSTALLMENT_TOTAL_MISMATCH");
    const uniqueDates = new Set(rows.map((row: { dueDate: Date }) => row.dueDate.toISOString().slice(0, 10)));
    if (uniqueDates.size !== rows.length && input.allowDuplicateDueDates !== true)
      throw new ServiceError("Duplicate installment due dates require explicit acceptance.", 422, "DUPLICATE_DUE_DATE");
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.installmentPlan.findFirst({ where: { customerId, active: true, deletedAt: null }, include: { installments: true } });
      if (existing?.installments.some((row) => Number(row.paidAmount) > 0))
        throw new ServiceError("A paid installment plan cannot be replaced.", 409, "INSTALLMENT_PLAN_LOCKED");
      if (existing) await tx.installmentPlan.update({ where: { id: existing.id }, data: { active: false } });
      const plan = await new InstallmentsRepository(tx).createPlan(
        {
          customerId,
          planType,
          name: input.name || (planType === "FULL" ? "Full Payment" : planType === "FIFTY_FIFTY" ? "50% / 50%" : "Custom Installments"),
          totalAmount: total,
          startDate: start,
          installmentsCount: count,
          lateFeeType: input.lateFeeType,
          lateFeeValue: Number(input.lateFeeValue || 0),
          gracePeriodDays: Number(input.gracePeriodDays || 0),
          reminderDays: input.reminderDays || [7, 3, 1, 0],
          duplicateDueDates: input.allowDuplicateDueDates === true,
          notes: input.notes,
        },
        rows,
      );
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: existing ? "replace installment plan" : "create installment plan", entityType: "installment_plan", entityId: plan.id, details: { customerId, planType, total, count } });
      return plan;
    });
  }
  async payment(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await new CustomersRepository(tx).find(input.customerId);
      if (!customer) throw new ServiceError("Customer not found.", 404);
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: input.paidAt || new Date(),
          description: `Customer payment ${input.paymentNo}`,
          referenceNumber: input.paymentNo,
          sourceType: "customer_payment",
          sourceId: input.idempotencyKey || input.paymentNo,
          lines: [
            { accountId: input.paymentAccountId, debit: Number(input.amount) },
            {
              accountId: customer.receivableAccountId,
              credit: Number(input.amount),
            },
          ],
        },
        actor,
      );
      const payment = await new AccountingPaymentsRepository(tx).createCustomer({
        customerId: customer.id,
        paymentNo: input.paymentNo,
        paymentType: input.paymentType || "receipt",
        amount: Number(input.amount),
        paymentAccountId: input.paymentAccountId,
        paymentMethod: input.paymentMethod || "Cash",
        paidAt: new Date(input.paidAt || Date.now()),
        journalEntryId: journal.id,
        notes: input.notes,
      });
      await allocateInstallmentPayment(tx, customer.id, Number(input.amount));
      return payment;
    });
  }

  private customerRows(id?: string) {
    return this.prisma.accountingCustomer.findMany({
      where: { id, deletedAt: null },
      include: {
        receivableAccount: true,
        student: { include: { financeAccount: { select: {
          id: true, expectedTotal: true,
          discounts: { where: { status: "APPROVED" }, select: { id: true, calculatedAmount: true, reason: true, effectiveDate: true, creditNoteNumber: true } },
        } } } },
        payments: {
          where: { deletedAt: null },
          orderBy: { paidAt: "desc" },
        },
        registration: {
          include: {
            invoices: {
              where: { deletedAt: null, status: { not: "VOID" } },
              include: { lines: true, studentDiscounts: { where: { status: "APPROVED" } } },
              orderBy: { issuedAt: "desc" },
            },
            payments: {
              where: { deletedAt: null, status: "COMPLETED" },
              orderBy: { paidAt: "desc" },
            },
          },
        },
        installmentPlans: { where: { active: true, deletedAt: null }, include: { installments: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { customerCode: "asc" },
    });
  }

  private shapeCustomer(customer: any) {
    const invoices = customer.registration?.invoices || [];
    const financePayments = customer.registration?.payments || [];
    const customerPayments = customer.payments || [];
    const payments = [
      ...financePayments.map((payment: any) => ({
        ...payment,
        receiptNumber: payment.receiptNumber,
      })),
      ...customerPayments.map((payment: any) => ({
        ...payment,
        receiptNumber: payment.paymentNo,
        method: payment.paymentMethod,
        status: "COMPLETED",
      })),
    ].sort((a: any, b: any) => b.paidAt.getTime() - a.paidAt.getTime());
    const invoiceTotal = invoices.reduce(
      (sum: number, invoice: any) => sum + Number(invoice.total),
      0,
    );
    const approvedDiscounts = customer.student?.financeAccount?.discounts || [];
    const grossFees = Number(customer.student?.financeAccount?.expectedTotal ?? invoiceTotal);
    const totalDiscounts = approvedDiscounts.reduce((sum: number, row: any) => sum + Number(row.calculatedAmount), 0);
    const netFees = Math.max(grossFees - totalDiscounts, 0);
    const paymentTotal = payments.reduce(
      (sum: number, payment: any) => sum + Number(payment.amount),
      0,
    );
    const balance = Math.round((netFees - paymentTotal) * 100) / 100;
    const activePlan = customer.installmentPlans?.[0];
    const planInstallments = activePlan?.installments || [];
    const now = new Date();
    const installmentStates = planInstallments.map((row: any) => ({ ...row, computedStatus: installmentStatus({ ...row, plan: activePlan }, now) }));
    const paidInstallments = installmentStates.filter((row: any) => row.computedStatus === "paid").length;
    const overdueInstallments = installmentStates.filter((row: any) => row.computedStatus.includes("overdue")).length;
    const nextInstallment = installmentStates.find((row: any) => row.computedStatus !== "paid");
    const storedProfile = (customer.student?.profile || {}) as Record<string, any>;
    const customerType = storedProfile.customerType || storedProfile.student?.manualCustomerType || "CHILD";
    return {
      id: customer.id,
      customerCode: customer.customerCode,
      studentId: customer.studentId,
      financeAccountId: customer.student?.financeAccount?.id || null,
      registrationId: customer.registrationId,
      registrationNumber: customer.registrationNumber,
      parentLink: customer.parentLink,
      nameAr: customer.nameAr,
      nameEn: customer.nameEn,
      grade: customer.student?.grade,
      customerType,
      position: storedProfile.worker?.position || null,
      department: storedProfile.worker?.department || null,
      phone: customer.phone,
      email: customer.email,
      nationalId: customer.nationalId,
      creditLimit: Number(customer.creditLimit || 0),
      openingBalance: Number(customer.openingBalance || 0),
      receivableAccountId: customer.receivableAccountId,
      receivableCode: customer.receivableAccount.code,
      receivableNameEn: customer.receivableAccount.name,
      status: customer.active ? "active" : "inactive",
      summary: {
        grossFees,
        totalDiscounts,
        netFees,
        currentBalance: balance,
        outstanding: Math.max(balance, 0),
        credit: Math.max(-balance, 0),
        overdue: installmentStates.filter((row: any) => row.computedStatus.includes("overdue")).reduce((sum: number, row: any) => sum + Number(row.amount) - Number(row.paidAmount), 0),
        invoiceTotal,
        paymentTotal,
        invoicesCount: invoices.length,
        paymentsCount: payments.length,
        paymentPlan: activePlan?.planType || "NONE",
        paidInstallments,
        remainingInstallments: Math.max(installmentStates.length - paidInstallments, 0),
        overdueInstallments,
        nextInstallmentAmount: nextInstallment ? Number(nextInstallment.amount) - Number(nextInstallment.paidAmount) : 0,
        nextDueDate: nextInstallment?.dueDate?.toISOString().slice(0, 10) || null,
      },
      discounts: approvedDiscounts.map((row: any) => ({
        id: row.id, amount: Number(row.calculatedAmount), reason: row.reason,
        effectiveDate: row.effectiveDate.toISOString().slice(0, 10), creditNoteNumber: row.creditNoteNumber,
      })),
      invoices: invoices.map((invoice: any) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        feeItem: invoice.lines[0]?.description || "School Fees",
        total: Number(invoice.total),
        status: invoice.status,
        issuedAt: invoice.issuedAt.toISOString().slice(0, 10),
      })),
      payments: payments.map((payment: any) => ({
        id: payment.id,
        receiptNumber: payment.receiptNumber,
        paymentItem: "School Fees",
        amount: Number(payment.amount),
        method: payment.method,
        status: payment.status,
        paidAt: payment.paidAt.toISOString().slice(0, 10),
      })),
    };
  }
}

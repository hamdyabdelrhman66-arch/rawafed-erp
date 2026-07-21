import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor, PaymentInput } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { FinanceAccountsRepository } from "../repositories/finance-accounts.repository.js";
import { FinanceInvoicesRepository } from "../repositories/finance-invoices.repository.js";
import { FinancePaymentsRepository } from "../repositories/finance-payments.repository.js";
import { ServiceError } from "./service.error.js";
import { JournalService } from "./journal.service.js";
import {
  calculateFeePreview,
  isSaudiNationalId,
  money,
  vatForSubtotal,
  vatRateForStudent,
} from "./student-vat.js";
import { categoryLabel, mappingFor, revenueCategory } from "./revenue-category.js";
import { nextInvoiceNumber } from "./invoice-number.service.js";
import { allocateInstallmentPayment, installmentStatus } from "./installment-allocation.service.js";
import { classifyPaymentError } from "./payment-error.js";
import { schoolProfileUsing } from "./school-settings.service.js";

const paidForAccount = (account: any) =>
  money(
    account.payments.reduce((n: number, p: any) => n + Number(p.amount), 0),
  );
const studentTaxIdentity = (student: any) => {
  const profile = (student?.profile || {}) as Record<string, any>;
  const source = profile.student || profile;
  return {
    identityType: source.identityType,
    identityNumber: student?.nationalId || source.nationalId,
    nationality: source.nationality,
  };
};
const accountShape = (a: any) => {
  const paid = paidForAccount(a);
  const expected = money(a.expectedTotal);
  const remaining = money(Math.max(expected - paid, 0));
  const allocatedByItem = (a.feeItems || []).map((item: any) =>
    money(
      (item.paymentAllocations || []).reduce(
        (sum: number, allocation: any) => sum + Number(allocation.amount),
        0,
      ),
    ),
  );
  let legacyUnallocated = money(
    Math.max(
      paid -
        allocatedByItem.reduce((sum: number, value: number) => sum + value, 0),
      0,
    ),
  );
  const feeItems = (a.feeItems || []).map((item: any, index: number) => {
    const expectedAmount = money(item.amount);
    const legacyPaid = money(
      Math.min(
        Math.max(expectedAmount - allocatedByItem[index], 0),
        legacyUnallocated,
      ),
    );
    legacyUnallocated = money(legacyUnallocated - legacyPaid);
    const paidAmount = money(allocatedByItem[index] + legacyPaid);
    return {
      id: item.id,
      name: item.name,
      category: item.serviceCategory || "LEGACY_COMBINED",
      amount: expectedAmount,
      subtotal: money(item.subtotal ?? (String(item.name).toUpperCase() === "VAT" ? 0 : item.amount)),
      vat: money(item.vatAmount ?? (String(item.name).toUpperCase() === "VAT" ? item.amount : 0)),
      vatRate: Number(item.vatRate || 0),
      governmentBorneVat: money(item.governmentBorneVat),
      taxTreatment: item.taxTreatment || "STANDARD",
      taxReason: item.taxReason || null,
      paid: paidAmount,
      remaining: money(expectedAmount - paidAmount),
    };
  });
  const subtotal = money(feeItems.reduce((sum: number, item: any) => sum + item.subtotal, 0));
  const vat = money(feeItems.reduce((sum: number, item: any) => sum + item.vat, 0));
  const governmentBorneVat = money(feeItems.reduce((sum: number, item: any) => sum + item.governmentBorneVat, 0));
  const plan = a.student?.customer?.installmentPlans?.[0];
  const installments = (plan?.installments || []).map((row: any) => ({ ...row, computedStatus: installmentStatus({ ...row, plan }) }));
  const paidInstallments = installments.filter((row: any) => row.computedStatus === "paid").length;
  const overdueInstallments = installments.filter((row: any) => row.computedStatus.includes("overdue")).length;
  const nextInstallment = installments.filter((row: any) => row.computedStatus !== "paid").sort((x: any, y: any) => x.dueDate.getTime() - y.dueDate.getTime())[0];
  const registrationProfile = a.registration?.data as any;
  return {
    id: a.id,
    registrationId: a.registrationId,
    registrationNumber: a.registration.registrationNumber,
    branchId: a.registration.branchId,
    studentId: a.studentId,
    studentName: a.student.englishName,
    grade: a.student.grade,
    nationalId: a.student.nationalId,
    vatExempt: isSaudiNationalId(a.student.nationalId),
    subtotal,
    vat,
    totalVat: money(vat + governmentBorneVat),
    governmentBorneVat,
    total: expected,
    expectedTotal: expected,
    paid,
    remaining,
    status: remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid",
    paymentPlan: plan?.planType || registrationProfile?.financial?.paymentPlan || "FULL",
    paidInstallments,
    remainingInstallments: Math.max(installments.length - paidInstallments, 0),
    overdueInstallments,
    nextInstallment: nextInstallment ? money(Number(nextInstallment.amount) - Number(nextInstallment.paidAmount)) : 0,
    nextDueDate: nextInstallment?.dueDate?.toISOString().slice(0, 10) || null,
    installments: installments.map((row: any) => ({
      id: row.id,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      amount: money(row.amount),
      paidAmount: money(row.paidAmount),
      remaining: money(Math.max(Number(row.amount) - Number(row.paidAmount), 0)),
      status: row.computedStatus,
    })),
    openInvoices: (a.invoices || []).map((invoice: any) => {
      const invoicePaid = money((invoice.payments || []).reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0));
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        category: invoice.serviceCategory,
        issuedAt: invoice.issuedAt.toISOString(),
        dueAt: invoice.dueAt?.toISOString() || null,
        total: money(invoice.total),
        paid: invoicePaid,
        remaining: money(Math.max(Number(invoice.total) - invoicePaid, 0)),
        status: invoice.status,
      };
    }),
    feeItems,
    canonicalInvoiceId: a.invoices?.[0]?.id,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
};
const invoiceShape = (i: any) => {
  const paid = money(
    i.payments.reduce((n: number, p: any) => n + Number(p.amount), 0),
  );
  const total = money(i.total);
  return {
    id: i.id,
    accountId: i.accountId,
    registrationId: i.registrationId,
    registrationNumber: i.account.registration.registrationNumber,
    invoiceNumber: i.invoiceNumber,
    studentName: i.account.student.englishName,
    studentArabicName: i.account.student.arabicName,
    nationalId: i.account.student.nationalId,
    customerId: i.account.student.customer?.id,
    feeItem: i.lines[0]?.description || "School Fees",
    category: i.serviceCategory || "LEGACY_COMBINED",
    categoryLabel: categoryLabel(i.serviceCategory || "LEGACY_COMBINED"),
    subtotal: money(i.subtotal),
    discount: money(i.discount),
    amountBeforeVat: money(i.subtotal),
    vat: money(i.vatAmount),
    governmentBorneVat: money(i.governmentBorneVat),
    parentPayable: money(i.parentPayable ?? i.total),
    taxTreatment: i.taxTreatment || "STANDARD",
    taxReason: i.taxReason || null,
    total,
    totalInvoice: total,
    vatExempt: isSaudiNationalId(i.account.student.nationalId),
    paid,
    remaining: money(Math.max(total - paid, 0)),
    paymentMethod: "",
    accountingAccountId: i.lines[0]?.revenueAccountId || null,
    accountingAccount: i.lines[0]?.revenueAccount ? `${i.lines[0].revenueAccount.code} - ${i.lines[0].revenueAccount.name}` : "",
    costCenterId: i.costCenterId || null,
    branchId: i.branchId || null,
    vatStatus: i.taxTreatment || (Number(i.vatAmount) > 0 ? "STANDARD_15" : "EXEMPT"),
    legacyCombined: Boolean(i.legacyCombined),
    status: i.status === "VOID" ? "Void" : paid >= total ? "Paid" : paid > 0 ? "Partially Paid" : "Pending",
    issuedAt: i.issuedAt.toISOString(),
    dueAt: i.dueAt?.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
};
const paymentShape = (p: any) => ({
  id: p.id,
  accountId: p.accountId,
  registrationId: p.registrationId,
  registrationNumber: p.account.registration.registrationNumber,
  receiptNumber: p.receiptNumber,
  paymentItem: p.feeAllocations?.length
    ? p.feeAllocations.map((allocation: any) => allocation.feeItem?.name).filter(Boolean).join(" + ")
    : "School Fees",
  feeItems: (p.feeAllocations || []).map((allocation: any) => ({
    name: allocation.feeItem?.name || "School Fees",
    amount: money(allocation.amount),
  })),
  amount: money(p.amount),
  method: p.method,
  status: p.status,
  paidAt: p.paidAt.toISOString(),
  collectedBy: p.collectedBy || "Finance",
  referenceNumber: p.referenceNumber || undefined,
  notes: p.notes || undefined,
  invoiceId: p.allocations[0]?.invoiceId,
  invoiceIds: p.allocations.map((allocation: any) => allocation.invoiceId),
  invoices: p.allocations.map((allocation: any) => ({
    invoiceId: allocation.invoiceId,
    invoiceNumber: allocation.invoice?.invoiceNumber || "",
    category: allocation.invoice?.serviceCategory || "LEGACY_COMBINED",
    categoryLabel: categoryLabel(allocation.invoice?.serviceCategory || "LEGACY_COMBINED"),
    subtotal: money(allocation.invoice?.subtotal),
    vat: money(allocation.invoice?.vatAmount),
    total: money(allocation.invoice?.total),
    amount: money(allocation.amount),
  })),
  nationalId: p.account.student.nationalId,
  vatExempt: isSaudiNationalId(p.account.student.nationalId),
  createdAt: p.createdAt.toISOString(),
});

export class FinanceService {
  constructor(private readonly prisma: PrismaClient) {}
  async revenueMappings() {
    const rows = await this.prisma.revenueCategoryMapping.findMany({ orderBy: { category: 'asc' } });
    const accountIds = [...new Set(rows.flatMap((row) => [row.revenueAccountId, row.costAccountId, row.receivableAccountId, row.inventoryAccountId].filter(Boolean) as string[]))];
    const accounts = await this.prisma.chartOfAccount.findMany({ where: { id: { in: accountIds }, deletedAt: null } });
    return rows.map((row) => ({
      ...row,
      revenueAccount: accounts.find((account) => account.id === row.revenueAccountId),
      costAccount: accounts.find((account) => account.id === row.costAccountId),
      receivableAccount: accounts.find((account) => account.id === row.receivableAccountId),
      inventoryAccount: accounts.find((account) => account.id === row.inventoryAccountId),
    }));
  }
  async updateRevenueMapping(categoryInput: string, input: any) {
    const category = revenueCategory(categoryInput);
    const ids = [input.revenueAccountId, input.costAccountId, input.receivableAccountId, input.inventoryAccountId].filter(Boolean);
    const accounts = await this.prisma.chartOfAccount.findMany({ where: { id: { in: ids }, active: true, deletedAt: null } });
    if (!input.revenueAccountId || accounts.length !== ids.length)
      throw new ServiceError('Every mapping must reference active accounting accounts.', 422, 'MAPPING_REQUIRED');
    return this.prisma.revenueCategoryMapping.upsert({
      where: { category },
      update: {
        revenueAccountId: input.revenueAccountId, costAccountId: input.costAccountId || null,
        receivableAccountId: input.receivableAccountId || null, inventoryAccountId: input.inventoryAccountId || null, costCenterId: input.costCenterId || null,
        branchId: input.branchId || null, taxTreatment: input.taxTreatment || 'STANDARD',
        saudiTaxTreatment: input.saudiTaxTreatment || 'STANDARD', vatRate: money(input.vatRate ?? 15), active: input.active !== false,
      },
      create: {
        category, revenueAccountId: input.revenueAccountId, costAccountId: input.costAccountId || null,
        receivableAccountId: input.receivableAccountId || null, inventoryAccountId: input.inventoryAccountId || null, costCenterId: input.costCenterId || null,
        branchId: input.branchId || null, taxTreatment: input.taxTreatment || 'STANDARD',
        saudiTaxTreatment: input.saudiTaxTreatment || 'STANDARD', vatRate: money(input.vatRate ?? 15), active: input.active !== false,
      },
    });
  }
  async directCosts(filters: { category?: string; from?: string; to?: string } = {}) {
    return this.prisma.directCostEvent.findMany({
      where: {
        category: filters.category ? revenueCategory(filters.category) : undefined,
        eventDate: {
          gte: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : undefined,
          lte: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined,
        },
      },
      orderBy: { eventDate: 'desc' },
    });
  }
  async createDirectCost(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const category = revenueCategory(input.category);
      const mapping = await mappingFor(tx, category);
      if (!mapping.cost) throw new ServiceError(`Cost account is not configured for ${category}.`, 422, 'MAPPING_REQUIRED');
      const creditAccount = await tx.chartOfAccount.findFirst({
        where: { id: input.creditAccountId, active: true, deletedAt: null, allowPosting: true },
      });
      if (!creditAccount) throw new ServiceError('A valid cash, bank, payable, or clearing account is required.', 422);
      const amount = money(input.amount);
      if (amount <= 0) throw new ServiceError('Direct cost amount must be greater than zero.', 422);
      const sourceId = String(input.sourceId || randomUUID());
      const event = await tx.directCostEvent.upsert({
        where: { sourceType_sourceId_category: { sourceType: input.sourceType || 'manual_direct_cost', sourceId, category } },
        update: {},
        create: {
          category, amount, sourceType: input.sourceType || 'manual_direct_cost', sourceId,
          invoiceId: input.invoiceId || null, studentId: input.studentId || null,
          route: input.route || null, area: input.area || null,
          eventDate: new Date(input.eventDate || Date.now()), notes: input.notes || null,
        },
      });
      await JournalService.postUsing(tx, {
        postingDate: event.eventDate,
        description: `${categoryLabel(category)} direct cost`,
        referenceNumber: sourceId,
        sourceType: 'direct_cost',
        sourceId: event.id,
        lines: [
          { accountId: mapping.cost.id, debit: amount, costCenterId: mapping.costCenterId || undefined },
          { accountId: creditAccount.id, credit: amount, costCenterId: mapping.costCenterId || undefined },
        ],
      }, actor);
      return event;
    });
  }
  async accounts(skip?: number, take?: number, actor?: Actor) {
    const rows = (await new FinanceAccountsRepository(this.prisma).list(skip, take)).map(accountShape);
    if (!actor?.id || actor.role === "Super Admin") return rows;
    const scopeSetting = await this.prisma.setting.findUnique({ where: { key: "user_branch_scopes" } });
    const scopes = (scopeSetting?.value || {}) as Record<string, unknown>;
    const allowedBranches = Array.isArray(scopes[actor.id]) ? scopes[actor.id] as string[] : null;
    return allowedBranches ? rows.filter((row: any) => allowedBranches.includes(row.branchId)) : rows;
  }
  async studentPaymentContext(
    studentId: string,
    options: { invoiceId?: string; installmentId?: string },
    actor: Actor,
  ) {
    const account = await new FinanceAccountsRepository(this.prisma).findByStudentId(studentId);
    if (!account)
      throw new ServiceError("Student payment account was not found.", 404, "STUDENT_PAYMENT_ACCOUNT_NOT_FOUND");

    // Branch scopes are configured centrally as { "user-id": ["branch-id"] }.
    // An omitted user keeps the existing global finance access for backwards compatibility.
    if (actor.id && actor.role !== "Super Admin") {
      const scopeSetting = await this.prisma.setting.findUnique({ where: { key: "user_branch_scopes" } });
      const scopes = (scopeSetting?.value || {}) as Record<string, unknown>;
      const allowedBranches = Array.isArray(scopes[actor.id]) ? scopes[actor.id] as string[] : null;
      if (allowedBranches && !allowedBranches.includes(account.registration.branchId))
        throw new ServiceError("You are not authorized to access this student's branch.", 403, "STUDENT_BRANCH_ACCESS_DENIED");
    }

    const shaped = accountShape(account) as any;
    if (options.invoiceId && !shaped.openInvoices.some((row: any) => row.id === options.invoiceId))
      throw new ServiceError("The selected invoice does not belong to this student or is not open.", 422, "PAYMENT_CONTEXT_INVOICE_MISMATCH");
    if (options.installmentId && !shaped.installments.some((row: any) => row.id === options.installmentId))
      throw new ServiceError("The selected installment does not belong to this student.", 422, "PAYMENT_CONTEXT_INSTALLMENT_MISMATCH");

    await new AuditRepository(this.prisma).create({
      actorId: actor.id,
      actorRole: actor.role,
      action: "VIEW_STUDENT_PAYMENT_CONTEXT",
      entityType: "student",
      entityId: studentId,
      details: { financeAccountId: account.id, invoiceId: options.invoiceId, installmentId: options.installmentId },
    });
    return {
      account: shaped,
      selectedInvoice: options.invoiceId ? shaped.openInvoices.find((row: any) => row.id === options.invoiceId) : null,
      selectedInstallment: options.installmentId ? shaped.installments.find((row: any) => row.id === options.installmentId) : null,
    };
  }
  async invoices(skip?: number, take?: number) {
    return (
      await new FinanceInvoicesRepository(this.prisma).list(skip, take)
    ).map(invoiceShape);
  }
  async invoiceDetails(id: string) {
    const invoice = await new FinanceInvoicesRepository(this.prisma).findById(id);
    if (!invoice) throw new ServiceError("Invoice not found.", 404, "INVOICE_NOT_FOUND");
    const registration = invoice.registration || invoice.account.registration;
    const student = invoice.account.student;
    const registrationData = (registration?.data || {}) as Record<string, any>;
    const profile = (student.profile || {}) as Record<string, any>;
    const paid = money(invoice.payments.reduce((sum: number, row: any) => sum + Number(row.amount), 0));
    const subtotal = money(invoice.subtotal);
    const discount = money(invoice.discount);
    const taxableSubtotal = money(Math.max(subtotal - discount, 0));
    const vatAmount = money(invoice.vatAmount);
    const total = money(invoice.total);
    const primaryJournal = invoice.journalEntries.find((row: any) => row.sourceType === "invoice" || row.invoiceId === invoice.id)
      || invoice.journalEntries[0]
      || null;
    const currentSchool = await schoolProfileUsing(this.prisma);
    const taxDecision = (invoice.taxDecision || {}) as Record<string, any>;
    const school = (taxDecision.schoolSnapshot || currentSchool) as Record<string, any>;
    const category = invoice.serviceCategory || "LEGACY_COMBINED";
    const categoryDetails: Record<string, unknown> = {};
    const candidateDetails: Record<string, unknown> = {
      grade: student.grade,
      className: profile.className || profile.class || registrationData.className || registrationData.class,
      route: registrationData.transportation?.route || registrationData.route,
      area: registrationData.transportation?.area || registrationData.area,
      size: registrationData.uniform?.size || registrationData.uniformSize,
      item: registrationData.books?.item || registrationData.uniform?.item,
      activity: registrationData.activities?.name || registrationData.activityName,
      servicePeriod: registrationData.servicePeriod,
    };
    for (const [key, value] of Object.entries(candidateDetails)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") categoryDetails[key] = value;
    }
    return {
      school: {
        ...school,
        settingsSource: taxDecision.schoolSnapshot ? "HISTORICAL_INVOICE_SNAPSHOT" : "CURRENT_SCHOOL_SETTINGS",
      },
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        category,
        categoryLabel: categoryLabel(category),
        status: invoice.status === "VOID" ? "Void" : paid >= total ? "Paid" : paid > 0 ? "Partially Paid" : "Pending",
        issuedAt: invoice.issuedAt.toISOString(),
        dueAt: invoice.dueAt?.toISOString() || null,
        academicYear: registration?.academicYear?.name || null,
        branch: registration?.branch ? { id: registration.branch.id, code: registration.branch.code, nameEn: registration.branch.name, nameAr: registration.branch.nameAr } : null,
        paymentPlan: registrationData.financial?.paymentPlan || registrationData.paymentPlan || null,
        createdBy: primaryJournal?.createdBy?.displayName || null,
        createdAt: invoice.createdAt.toISOString(),
        notes: primaryJournal?.notes || null,
      },
      student: {
        id: student.id,
        customerId: student.customer?.id || null,
        registrationNumber: registration?.registrationNumber || student.registrationNumber,
        nameAr: student.arabicName,
        nameEn: student.englishName,
        grade: student.grade,
        className: profile.className || profile.class || registrationData.className || registrationData.class || null,
        nationalId: student.nationalId,
        guardianName: student.parentName,
        guardianPhone: student.parentPhone,
      },
      lines: invoice.lines.map((line: any) => ({
        id: line.id,
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: money(line.unitPrice),
        vatRate: Number(line.vatRate),
        netAmount: money(line.netAmount),
        vatAmount: money(line.vatAmount),
        governmentBorneVat: money(line.governmentBorneVat),
        taxTreatment: line.taxTreatment || invoice.taxTreatment,
        taxReason: line.taxReason || invoice.taxReason,
        totalAmount: money(line.totalAmount),
        revenueAccount: line.revenueAccount ? { id: line.revenueAccount.id, code: line.revenueAccount.code, nameEn: line.revenueAccount.name, nameAr: line.revenueAccount.nameAr } : null,
      })),
      totals: {
        subtotal,
        discount,
        taxableSubtotal,
        vatRate: taxableSubtotal > 0 ? Math.round((vatAmount / taxableSubtotal) * 10000) / 100 : 0,
        vatAmount,
        totalVat: money(vatAmount + Number(invoice.governmentBorneVat || 0)),
        governmentBorneVat: money(invoice.governmentBorneVat),
        parentPayable: money(invoice.parentPayable ?? invoice.total),
        taxTreatment: invoice.taxTreatment || "STANDARD",
        taxReason: invoice.taxReason || null,
        total,
        paid,
        remaining: money(Math.max(total - paid, 0)),
        currency: invoice.account.currency,
        vatStatus: invoice.taxTreatment || (vatAmount > 0 ? "STANDARD_15" : "EXEMPT"),
      },
      categoryDetails,
      allocations: invoice.payments.map((allocation: any) => ({
        id: allocation.id,
        paymentId: allocation.paymentId,
        receiptNumber: allocation.payment.receiptNumber,
        paidAt: allocation.payment.paidAt.toISOString(),
        method: allocation.payment.method,
        referenceNumber: allocation.payment.referenceNumber,
        status: allocation.payment.status,
        amount: money(allocation.amount),
      })),
      journal: primaryJournal ? {
        id: primaryJournal.id,
        entryNumber: primaryJournal.entryNumber,
        status: primaryJournal.status,
        postingDate: primaryJournal.postingDate.toISOString(),
      } : null,
      links: {
        customerId: student.customer?.id || null,
        financeAccountId: invoice.accountId,
      },
      warnings: primaryJournal ? [] : ["MISSING_POSTED_JOURNAL"],
    };
  }
  async recordInvoiceDocumentAccess(id: string, action: "PRINT" | "EXPORT_PDF", actor: Actor) {
    const detail = await this.invoiceDetails(id);
    await new AuditRepository(this.prisma).create({
      action: action === "PRINT" ? "INVOICE_PRINTED" : "INVOICE_PDF_EXPORTED",
      entityType: "FinanceInvoice",
      entityId: id,
      actorId: actor.id,
      actorRole: actor.role,
      details: { invoiceNumber: detail.invoice.invoiceNumber, action },
    });
    return detail;
  }
  async payments(skip?: number, take?: number) {
    return (
      await new FinancePaymentsRepository(this.prisma).list(skip, take)
    ).map(paymentShape);
  }
  async createInvoice(input: Record<string, any>, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const accounts = new FinanceAccountsRepository(tx);
      const account = input.accountId
        ? await accounts.findById(String(input.accountId))
        : input.registrationId
          ? await accounts.findByRegistrationId(input.registrationId)
          : null;
      if (!account)
        throw new ServiceError("Finance account not found.", 404, "NOT_FOUND");
      const subtotal = money(input.amountBeforeVat ?? input.amount);
      const discount = money(input.discount);
      if (discount < 0 || discount > subtotal)
        throw new ServiceError("Invoice discount is invalid.", 422, "VALIDATION_ERROR");
      const taxableAmount = money(subtotal - discount);
      const category = revenueCategory(input.serviceCategory || input.feeItem || input.service);
      const mapping = await mappingFor(tx, category);
      const taxPreview = calculateFeePreview(
        studentTaxIdentity(account.student),
        [{ name: String(input.feeItem || input.service || categoryLabel(category)), category, amount: taxableAmount }],
        [mapping],
      );
      const taxLine = taxPreview.lines[0];
      const vat = taxLine.chargedVat;
      const governmentBorneVat = taxLine.governmentBorneAmount;
      const totalVat = taxLine.vatAmount;
      const total = taxLine.parentPayable;
      if (total <= 0) throw new ServiceError("Invoice totals are invalid.", 422);
      const issuedAt = new Date(input.date || Date.now());
      const invoiceNumber = input.invoiceNumber
        ? String(input.invoiceNumber)
        : await nextInvoiceNumber(tx, category, issuedAt);
      const existing = await new FinanceInvoicesRepository(tx).findByNumber(
        invoiceNumber,
      );
      if (existing) {
        if (
          existing.accountId === account.id &&
          money(existing.subtotal) === subtotal &&
          money(existing.vatAmount) === vat &&
          money(existing.total) === total
        )
          return invoiceShape(existing);
        throw new ServiceError(
          "Invoice number already belongs to a different transaction.",
          409,
          "DUPLICATE_INVOICE",
        );
      }
      const schoolSnapshot = await schoolProfileUsing(tx);
      const row = await new FinanceInvoicesRepository(tx).create(
        {
          id: input.id ? String(input.id) : randomUUID(),
          invoiceNumber,
          accountId: account.id,
          registrationId: account.registrationId,
          subtotal,
          vatAmount: vat,
          governmentBorneVat,
          parentPayable: total,
          taxTreatment: taxLine.treatment,
          taxReason: taxLine.reasonCode,
          taxDecision: { ...taxPreview, schoolSnapshot } as unknown as Prisma.InputJsonValue,
          discount,
          total,
          serviceCategory: category,
          legacyCombined: false,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          issuedAt,
        },
        {
          id: randomUUID(),
          description: String(input.feeItem || input.service || "School Fees"),
          quantity: 1,
          unitPrice: taxableAmount,
          vatRate: taxLine.vatRate,
          netAmount: taxableAmount,
          vatAmount: vat,
          governmentBorneVat,
          taxTreatment: taxLine.treatment,
          taxReason: taxLine.reasonCode,
          totalAmount: total,
        },
      );
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create invoice",
        entityType: "finance_invoice",
        entityId: row.id,
      });
      const customer = await tx.accountingCustomer.findUnique({
        where: { studentId: account.studentId },
      });
      const vatAccount = totalVat
        ? await tx.chartOfAccount.findUnique({
            where: { systemKey: "vat-payable" },
          })
        : null;
      const governmentVatAccount = governmentBorneVat
        ? await tx.chartOfAccount.findUnique({ where: { systemKey: "government-vat-receivable" } })
        : null;
      if (!customer || (totalVat && !vatAccount) || (governmentBorneVat && !governmentVatAccount))
        throw new ServiceError(
          "Required VAT accounting accounts are not configured.",
          422,
          "ACCOUNT_MAPPING_MISSING",
        );
      const outbox = await tx.accountingOutbox.create({
        data: {
          eventType: "INVOICE_CREATED",
          aggregateType: "finance_invoice",
          aggregateId: row.id,
          payload: { invoiceId: row.id },
        },
      });
      await JournalService.postUsing(
        tx,
        {
          postingDate: row.issuedAt,
          description: `Sales invoice ${row.invoiceNumber}`,
          referenceNumber: row.invoiceNumber,
          sourceType: "finance_invoice",
          sourceId: row.id,
          invoiceId: row.id,
          lines: [
            { accountId: mapping.receivable?.id || customer.receivableAccountId, debit: total },
            ...(governmentBorneVat ? [{ accountId: governmentVatAccount!.id, debit: governmentBorneVat }] : []),
            { accountId: mapping.revenue.id, credit: taxableAmount },
            ...(totalVat ? [{ accountId: vatAccount!.id, credit: totalVat }] : []),
          ],
        },
        actor,
      );
      await tx.accountingOutbox.update({
        where: { id: outbox.id },
        data: { processedAt: new Date() },
      });
      return invoiceShape(row);
    });
  }
  async createPayment(input: PaymentInput, actor: Actor) {
    let transactionStep = "ACCOUNT_LOAD";
    try {
      const preview = await new FinanceAccountsRepository(this.prisma).findById(input.accountId);
      if (!preview) throw new ServiceError("Finance account not found.", 404, "NOT_FOUND");
      if (input.installmentId && !(accountShape(preview) as any).installments.some((row: any) => row.id === input.installmentId))
        throw new ServiceError("The selected installment does not belong to this student.", 422, "PAYMENT_CONTEXT_INSTALLMENT_MISMATCH");
      const categorized = preview.feeItems.some((item: any) => item.serviceCategory && item.serviceCategory !== "LEGACY_COMBINED");
      if (!categorized || input.invoiceId) return await this.createPaymentLegacy(input, actor);

      return await this.prisma.$transaction(async (tx) => {
      transactionStep = "ACCOUNT_LOAD";
      const account = await new FinanceAccountsRepository(tx).findById(input.accountId);
      if (!account) throw new ServiceError("Finance account not found.", 404, "NOT_FOUND");
      const customer = await tx.accountingCustomer.findUnique({ where: { studentId: account.studentId } });
      if (!customer) throw new ServiceError("Student receivable account is not configured.", 422, "ACCOUNT_MAPPING_MISSING");

      const amount = money(input.amount);
      const shaped = accountShape(account);
      if (amount <= 0) throw new ServiceError("Payment amount must be greater than zero.", 422);
      if (amount > shaped.remaining) throw new ServiceError("Payment exceeds the outstanding student balance.", 422);
      const submitted = input.lines?.length ? input.lines : [{ feeItem: input.paymentItem || "School Fees", amount }];
      const names = new Set<string>();
      let submittedTotal = 0;
      const feeAllocations: Array<{ feeItemId: string; amount: number }> = [];
      const resolvedLines: Array<{ feeItem: any; amount: number }> = [];
      for (const line of submitted) {
        const name = String(line.feeItem || "").trim();
        const lineAmount = money(line.amount);
        const current = shaped.feeItems.find((item: any) => item.name === name);
        const feeItem = account.feeItems.find((item: any) => item.name === name);
        if (!name || names.has(name) || !current || !feeItem || lineAmount <= 0 || lineAmount > money(current.remaining))
          throw new ServiceError(`Payment exceeds the outstanding amount for ${name || "fee item"}.`, 422, "FEE_ITEM_OVERPAYMENT");
        names.add(name);
        submittedTotal = money(submittedTotal + lineAmount);
        feeAllocations.push({ feeItemId: feeItem.id, amount: lineAmount });
        resolvedLines.push({ feeItem, amount: lineAmount });
      }
      if (submittedTotal !== amount) throw new ServiceError("Payment lines do not equal the payment total.", 422, "INVALID_PAYMENT_ALLOCATION");

      const invoiceRepo = new FinanceInvoicesRepository(tx);
      transactionStep = "INVOICE_ALLOCATION";
      const openInvoices = await invoiceRepo.findOpenAllForAccount(account.id);
      const invoiceAllocations: Array<{ invoiceId: string; amount: number }> = [];
      const affected = new Map<string, { invoice: any; previousPaid: number; allocated: number; receivableAccountId: string }>();
      const vatAccount = await tx.chartOfAccount.findUnique({ where: { systemKey: "vat-payable" } });

      const selectedByCategory = new Map<string, number>();
      for (const line of resolvedLines) {
        const category = revenueCategory(line.feeItem.serviceCategory || line.feeItem.name);
        selectedByCategory.set(category, money((selectedByCategory.get(category) || 0) + line.amount));
      }

      for (const [categoryKey, selectedAmount] of selectedByCategory) {
        const category = revenueCategory(categoryKey);
        transactionStep = "ACCOUNT_MAPPING";
        const mapping = await mappingFor(tx, category);
        const receivableAccountId = mapping.receivable?.id || customer.receivableAccountId;
        let invoice = openInvoices.find((row: any) => row.serviceCategory === category);
        if (!invoice) {
          const categoryItems = account.feeItems.filter(
            (item: any) => revenueCategory(item.serviceCategory || item.name) === category,
          );
          const invoiceSubtotal = money(categoryItems.reduce(
            (sum: number, item: any) => sum + Number(item.subtotal ?? item.amount),
            0,
          ));
          const invoiceTaxPreview = calculateFeePreview(
            studentTaxIdentity(account.student),
            [{ name: categoryItems.map((item: any) => item.name).join(", ") || categoryLabel(category), category, amount: invoiceSubtotal }],
            [mapping],
          );
          const invoiceTaxLine = invoiceTaxPreview.lines[0];
          const invoiceVat = invoiceTaxLine.chargedVat;
          const invoiceGovernmentVat = invoiceTaxLine.governmentBorneAmount;
          const invoiceTotalVat = invoiceTaxLine.vatAmount;
          const invoiceTotal = invoiceTaxLine.parentPayable;
          if (invoiceTotalVat && !vatAccount) throw new ServiceError("VAT payable account is not configured.", 422, "ACCOUNT_MAPPING_MISSING");
          const governmentVatAccount = invoiceGovernmentVat
            ? await tx.chartOfAccount.findUnique({ where: { systemKey: "government-vat-receivable" } })
            : null;
          if (invoiceGovernmentVat && !governmentVatAccount)
            throw new ServiceError("Government VAT receivable account is not configured.", 422, "ACCOUNT_MAPPING_MISSING");
          const issuedAt = new Date(input.paidAt || Date.now());
          const schoolSnapshot = await schoolProfileUsing(tx);
          invoice = await invoiceRepo.create(
            {
              id: randomUUID(),
              invoiceNumber: await nextInvoiceNumber(tx, category, issuedAt),
              accountId: account.id,
              registrationId: account.registrationId,
              subtotal: invoiceSubtotal,
              vatAmount: invoiceVat,
              governmentBorneVat: invoiceGovernmentVat,
              parentPayable: invoiceTotal,
              taxTreatment: invoiceTaxLine.treatment,
              taxReason: invoiceTaxLine.reasonCode,
              taxDecision: { ...invoiceTaxPreview, schoolSnapshot } as unknown as Prisma.InputJsonValue,
              total: invoiceTotal,
              serviceCategory: category,
              costCenterId: mapping.costCenterId,
              branchId: mapping.branchId || account.registration.branchId,
              legacyCombined: false,
              issuedAt,
            },
            {
              id: randomUUID(),
              description: categoryItems.map((item: any) => item.name).join(", ") || categoryLabel(category),
              quantity: 1,
              unitPrice: invoiceSubtotal,
              vatRate: invoiceTaxLine.vatRate,
              netAmount: invoiceSubtotal,
              vatAmount: invoiceVat,
              governmentBorneVat: invoiceGovernmentVat,
              taxTreatment: invoiceTaxLine.treatment,
              taxReason: invoiceTaxLine.reasonCode,
              totalAmount: invoiceTotal,
              revenueAccountId: mapping.revenue.id,
            },
          );
          openInvoices.push(invoice);
          const outbox = await tx.accountingOutbox.create({
            data: { eventType: "INVOICE_CREATED", aggregateType: "finance_invoice", aggregateId: invoice.id, payload: { invoiceId: invoice.id, category } },
          });
          transactionStep = "AUTOMATIC_JOURNAL";
          await JournalService.postUsing(tx, {
            postingDate: invoice.issuedAt,
            description: `${categoryLabel(category)} invoice ${invoice.invoiceNumber}`,
            referenceNumber: invoice.invoiceNumber,
            sourceType: "finance_invoice",
            sourceId: invoice.id,
            invoiceId: invoice.id,
            lines: [
              { accountId: receivableAccountId, debit: invoiceTotal, costCenterId: mapping.costCenterId || undefined },
              ...(invoiceGovernmentVat ? [{ accountId: governmentVatAccount!.id, debit: invoiceGovernmentVat, costCenterId: mapping.costCenterId || undefined }] : []),
              { accountId: mapping.revenue.id, credit: invoiceSubtotal, costCenterId: mapping.costCenterId || undefined },
              ...(invoiceTotalVat ? [{ accountId: vatAccount!.id, credit: invoiceTotalVat, costCenterId: mapping.costCenterId || undefined }] : []),
            ],
          }, actor);
          await tx.accountingOutbox.update({ where: { id: outbox.id }, data: { processedAt: new Date() } });
          transactionStep = "AUDIT_LOG";
          await new AuditRepository(tx).create({
            actorId: actor.id, actorRole: actor.role, action: "create categorized invoice", entityType: "finance_invoice", entityId: invoice.id,
            details: { category, accountId: account.id },
          });
        }
        const previousPaid = money(invoice.payments.reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0));
        const existing = affected.get(invoice.id);
        const allocated = money((existing?.allocated || 0) + selectedAmount);
        if (allocated > money(Number(invoice.total) - previousPaid))
          throw new ServiceError(`Payment exceeds the ${categoryLabel(category)} invoice balance.`, 422, "INVOICE_OVERPAYMENT");
        affected.set(invoice.id, { invoice, previousPaid, allocated, receivableAccountId });
      }
      for (const value of affected.values())
        invoiceAllocations.push({ invoiceId: value.invoice.id, amount: value.allocated });

      const receiptNumber = input.receiptNumber || `REC-${Date.now()}-${randomUUID().slice(0, 8)}`;
      if (await new FinancePaymentsRepository(tx).findByReceipt(receiptNumber))
        throw new ServiceError("Receipt number has already been posted.", 409, "DUPLICATE_RECEIPT");
      transactionStep = "PAYMENT_CREATION";
      const payment = await new FinancePaymentsRepository(tx).createWithAllocation({
        receiptNumber,
        accountId: account.id,
        registrationId: account.registrationId,
        amount,
        method: input.method || "Cash",
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        paidAt: new Date(input.paidAt || Date.now()),
        collectedBy: actor.displayName || "Finance",
        invoiceAllocations,
        feeAllocations,
      });
      transactionStep = "INSTALLMENT_UPDATE";
      await allocateInstallmentPayment(tx, customer.id, amount);
      transactionStep = "STUDENT_BALANCE_UPDATE";
      for (const value of affected.values()) {
        const paidAfter = money(value.previousPaid + value.allocated);
        await invoiceRepo.updateStatus(value.invoice.id, paidAfter >= money(value.invoice.total) ? "PAID" : "PARTIALLY_PAID");
      }

      const cashKey = /bank|transfer|card|online/i.test(input.method || "") ? "bank-main" : "cash-main";
      transactionStep = "ACCOUNT_MAPPING";
      const cash = await tx.chartOfAccount.findUnique({ where: { systemKey: cashKey } });
      if (!cash) throw new ServiceError("Cash or bank account is not configured.", 422, "ACCOUNT_MAPPING_MISSING");
      const paymentOutbox = await tx.accountingOutbox.create({
        data: { eventType: "PAYMENT_CREATED", aggregateType: "finance_payment", aggregateId: payment.id, payload: { paymentId: payment.id, invoiceIds: invoiceAllocations.map((item) => item.invoiceId) } },
      });
      transactionStep = "AUTOMATIC_JOURNAL";
      await JournalService.postUsing(tx, {
        postingDate: payment.paidAt,
        description: `Consolidated receipt ${payment.receiptNumber}`,
        referenceNumber: payment.receiptNumber,
        sourceType: "finance_payment",
        sourceId: payment.id,
        paymentId: payment.id,
        lines: [
          { accountId: cash.id, debit: amount },
          ...[...affected.values()].map((value) => ({
            accountId: value.receivableAccountId,
            credit: value.allocated,
          })),
        ],
      }, actor);
      await tx.accountingOutbox.update({ where: { id: paymentOutbox.id }, data: { processedAt: new Date() } });
      transactionStep = "AUDIT_LOG";
      await new AuditRepository(tx).create({
        actorId: actor.id, actorRole: actor.role, action: "add categorized payment", entityType: "finance_payment", entityId: payment.id,
        details: { accountId: account.id, invoiceIds: invoiceAllocations.map((item) => item.invoiceId), amount },
      });
      const invoiceResults = [...affected.values()].map((value) => invoiceShape({
        ...value.invoice,
        payments: [...value.invoice.payments, { amount: value.allocated }],
      }));
      return {
        payment: paymentShape(payment),
        account: accountShape({ ...account, payments: [...account.payments, payment] }),
        invoice: invoiceResults[0],
        invoices: invoiceResults,
        consolidatedReceipt: { receiptNumber, total: amount, invoices: invoiceAllocations },
      };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      throw classifyPaymentError(error, transactionStep);
    }
  }

  private async createPaymentLegacy(input: PaymentInput, actor: Actor) {
    let transactionStep = "ACCOUNT_LOAD";
    try {
      return await this.prisma.$transaction(
      async (tx) => {
        transactionStep = "ACCOUNT_LOAD";
        const accounts = new FinanceAccountsRepository(tx);
        const account = await accounts.findById(input.accountId);
        if (!account)
          throw new ServiceError(
            "Finance account not found.",
            404,
            "NOT_FOUND",
          );
        const invoices = new FinanceInvoicesRepository(tx);
        let invoice = input.invoiceId
          ? await invoices.findById(input.invoiceId)
          : await invoices.findOpenForAccount(account.id);
        if (input.invoiceId && !invoice)
          throw new ServiceError("Invoice not found.", 404, "NOT_FOUND");
        const paidAt = new Date(input.paidAt || Date.now());
        const customer = await tx.accountingCustomer.findUnique({
          where: { studentId: account.studentId },
        });
        if (!customer)
          throw new ServiceError(
            "Student receivable account is not configured.",
            422, "ACCOUNT_MAPPING_MISSING",
          );
        if (!invoice) {
          const shapedAccount = accountShape(account);
          const invoiceTotal = money(shapedAccount.remaining);
          if (invoiceTotal <= 0)
            throw new ServiceError(
              "Student account has no outstanding balance to invoice.",
              422,
            );
          transactionStep = "ACCOUNT_MAPPING";
          const revenue = await tx.chartOfAccount.findUnique({
            where: { systemKey: "tuition-revenue" },
          });
          if (!revenue)
            throw new ServiceError(
              "Tuition revenue account is not configured.", 422, "ACCOUNT_MAPPING_MISSING",
            );
          const invoiceSubtotal = money(shapedAccount.subtotal);
          const invoiceVat = vatForSubtotal(
            invoiceSubtotal,
            account.student.nationalId,
          );
          if (money(invoiceSubtotal + invoiceVat) !== invoiceTotal)
            throw new ServiceError(
              "Student finance account VAT totals are inconsistent.",
              422,
            );
          const vatAccount = invoiceVat
            ? await tx.chartOfAccount.findUnique({
                where: { systemKey: "vat-payable" },
              })
            : null;
          if (invoiceVat && !vatAccount)
            throw new ServiceError("VAT payable account is not configured.", 422, "ACCOUNT_MAPPING_MISSING");
          const invoiceNumber = `INV-AUTO-${Date.now()}-${randomUUID().slice(0, 8)}`;
          const schoolSnapshot = await schoolProfileUsing(tx);
          invoice = await invoices.create(
            {
              id: randomUUID(),
              invoiceNumber,
              accountId: account.id,
              registrationId: account.registrationId,
              subtotal: invoiceSubtotal,
              vatAmount: invoiceVat,
              taxDecision: { schoolSnapshot } as unknown as Prisma.InputJsonValue,
              total: invoiceTotal,
              issuedAt: paidAt,
            },
            {
              id: randomUUID(),
              description: "School Fees",
              quantity: 1,
              unitPrice: invoiceSubtotal,
              vatRate: vatRateForStudent(account.student.nationalId),
              netAmount: invoiceSubtotal,
              vatAmount: invoiceVat,
              totalAmount: invoiceTotal,
              revenueAccountId: revenue.id,
            },
          );
          await new AuditRepository(tx).create({
            actorId: actor.id,
            actorRole: actor.role,
            action: "auto-create invoice for payment",
            entityType: "finance_invoice",
            entityId: invoice.id,
          });
          const invoiceOutbox = await tx.accountingOutbox.create({
            data: {
              eventType: "INVOICE_CREATED",
              aggregateType: "finance_invoice",
              aggregateId: invoice.id,
              payload: { invoiceId: invoice.id },
            },
          });
          transactionStep = "AUTOMATIC_JOURNAL";
          await JournalService.postUsing(
            tx,
            {
              postingDate: invoice.issuedAt,
              description: `Sales invoice ${invoice.invoiceNumber}`,
              referenceNumber: invoice.invoiceNumber,
              sourceType: "finance_invoice",
              sourceId: invoice.id,
              invoiceId: invoice.id,
              lines: [
                {
                  accountId: customer.receivableAccountId,
                  debit: invoiceTotal,
                },
                { accountId: revenue.id, credit: invoiceSubtotal },
                ...(invoiceVat
                  ? [{ accountId: vatAccount!.id, credit: invoiceVat }]
                  : []),
              ],
            },
            actor,
          );
          await tx.accountingOutbox.update({
            where: { id: invoiceOutbox.id },
            data: { processedAt: new Date() },
          });
        }
        if (invoice.accountId !== account.id)
          throw new ServiceError(
            "Invoice does not belong to finance account.",
            422,
          );
        const already = money(
          (await new FinancePaymentsRepository(tx).paidForInvoice(invoice.id))
            ._sum.amount,
        );
        const remaining = money(Number(invoice.total) - already);
        const amount = money(input.amount);
        if (amount <= 0)
          throw new ServiceError(
            "Payment amount must be greater than zero.",
            422,
          );
        let feeAllocations: Array<{ feeItemId: string; amount: number }> = [];
        if (input.lines?.length) {
          const authoritative = accountShape(account).feeItems as Array<{
            name: string;
            remaining: number;
          }>;
          const submittedNames = new Set<string>();
          let submittedTotal = 0;
          for (const line of input.lines) {
            const name = String(line.feeItem || "").trim();
            if (!name || submittedNames.has(name))
              throw new ServiceError(
                "Payment fee-item lines are invalid.",
                422,
              );
            submittedNames.add(name);
            const current = authoritative.find((item) => item.name === name);
            const feeItem = account.feeItems.find(
              (item: any) => item.name === name,
            );
            const lineAmount = money(line.amount);
            if (
              !current ||
              !feeItem ||
              lineAmount <= 0 ||
              lineAmount > money(current.remaining)
            )
              throw new ServiceError(
                `Payment exceeds the outstanding amount for ${name || "fee item"}.`,
                422,
                "FEE_ITEM_OVERPAYMENT",
              );
            submittedTotal = money(submittedTotal + lineAmount);
            feeAllocations.push({ feeItemId: feeItem.id, amount: lineAmount });
          }
          if (submittedTotal !== amount)
            throw new ServiceError(
              "Payment lines do not equal the payment total.",
              422, "INVALID_PAYMENT_ALLOCATION",
            );
        }
        if (amount > remaining)
          throw new ServiceError(
            "Payment exceeds the outstanding invoice balance.",
            422,
          );
        const receiptNumber =
          input.receiptNumber ||
          `REC-${Date.now()}-${randomUUID().slice(0, 8)}`;
        if (
          await new FinancePaymentsRepository(tx).findByReceipt(receiptNumber)
        )
          throw new ServiceError(
            "Receipt number has already been posted.",
            409,
            "DUPLICATE_RECEIPT",
          );
        transactionStep = "PAYMENT_CREATION";
        const payment = await new FinancePaymentsRepository(
          tx,
        ).createWithAllocation({
          receiptNumber,
          accountId: account.id,
          registrationId: account.registrationId,
          amount,
          method: input.method || "Cash",
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          paidAt,
          collectedBy: actor.displayName || "Finance",
          invoiceId: invoice.id,
          feeAllocations,
        });
        transactionStep = "INSTALLMENT_UPDATE";
        await allocateInstallmentPayment(tx, customer.id, amount);
        transactionStep = "STUDENT_BALANCE_UPDATE";
        await invoices.updateStatus(
          invoice.id,
          amount === remaining ? "PAID" : "PARTIALLY_PAID",
        );
        transactionStep = "AUDIT_LOG";
        await new AuditRepository(tx).create({
          actorId: actor.id,
          actorRole: actor.role,
          action: "add payment",
          entityType: "finance_payment",
          entityId: payment.id,
          details: { accountId: account.id, invoiceId: invoice.id, amount },
        });
        const cashKey = /bank|transfer|card|online/i.test(input.method || "")
          ? "bank-main"
          : "cash-main";
        transactionStep = "ACCOUNT_MAPPING";
        const cash = await tx.chartOfAccount.findUnique({
          where: { systemKey: cashKey },
        });
        if (!cash)
          throw new ServiceError(
            "Cash or bank account is not configured.", 422, "ACCOUNT_MAPPING_MISSING",
          );
        const paymentOutbox = await tx.accountingOutbox.create({
          data: {
            eventType: "PAYMENT_CREATED",
            aggregateType: "finance_payment",
            aggregateId: payment.id,
            payload: { paymentId: payment.id, invoiceId: invoice.id },
          },
        });
        transactionStep = "AUTOMATIC_JOURNAL";
        await JournalService.postUsing(
          tx,
          {
            postingDate: payment.paidAt,
            description: `Receipt ${payment.receiptNumber}`,
            referenceNumber: payment.receiptNumber,
            sourceType: "finance_payment",
            sourceId: payment.id,
            paymentId: payment.id,
            lines: [
              { accountId: cash.id, debit: amount },
              { accountId: customer.receivableAccountId, credit: amount },
            ],
          },
          actor,
        );
        await tx.accountingOutbox.update({
          where: { id: paymentOutbox.id },
          data: { processedAt: new Date() },
        });
        return {
          payment: paymentShape(payment),
          account: accountShape({
            ...account,
            payments: [...account.payments, payment],
          }),
          invoice: invoiceShape({
            ...invoice,
            payments: [...invoice.payments, { amount }],
          }),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
      );
    } catch (error) {
      throw classifyPaymentError(error, transactionStep);
    }
  }

  private async reversePayment(
    id: string,
    status: "REFUNDED" | "VOID",
    actor: Actor,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const payments = new FinancePaymentsRepository(tx);
        const payment = await payments.findById(id);
        if (!payment)
          throw new ServiceError("Payment not found.", 404, "NOT_FOUND");
        if (payment.status === status) return paymentShape(payment);
        if (payment.status !== "COMPLETED")
          throw new ServiceError(
            "Only a completed payment can be reversed.",
            409,
            "PAYMENT_NOT_REVERSIBLE",
          );
        const journal = payment.journalEntries.find(
          (entry) =>
            entry.sourceType === "finance_payment" && entry.sourceId === id,
        );
        if (!journal)
          throw new ServiceError(
            "Payment journal entry was not found.",
            409,
            "PAYMENT_JOURNAL_MISSING",
          );
        await JournalService.reverseUsing(
          tx,
          journal.id,
          actor,
          status === "REFUNDED"
            ? "finance_payment_refund"
            : "finance_payment_void",
        );
        const updated = await tx.financePayment.update({
          where: { id },
          data: { status },
          include: {
            account: { include: { student: true, registration: true } },
            allocations: true,
          },
        });
        const customer = payment.account?.studentId
          ? await tx.accountingCustomer.findUnique({
              where: { studentId: payment.account.studentId },
              select: { id: true },
            })
          : null;
        if (customer)
          await allocateInstallmentPayment(tx, customer.id, 0);
        for (const allocation of payment.allocations) {
          const aggregate = await payments.paidForInvoice(allocation.invoiceId);
          const paid = money(aggregate._sum.amount);
          const total = money(allocation.invoice.total);
          await new FinanceInvoicesRepository(tx).updateStatus(
            allocation.invoiceId,
            paid <= 0 ? "ISSUED" : paid >= total ? "PAID" : "PARTIALLY_PAID",
          );
        }
        await new AuditRepository(tx).create({
          actorId: actor.id,
          actorRole: actor.role,
          action: status === "REFUNDED" ? "refund payment" : "cancel payment",
          entityType: "finance_payment",
          entityId: id,
          details: { receiptNumber: payment.receiptNumber, amount: money(payment.amount) },
        });
        return paymentShape(updated);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  refundPayment(id: string, actor: Actor) {
    return this.reversePayment(id, "REFUNDED", actor);
  }

  cancelPayment(id: string, actor: Actor) {
    return this.reversePayment(id, "VOID", actor);
  }

  async cancelInvoice(id: string, actor: Actor) {
    return this.prisma.$transaction(
      async (tx) => {
        const invoices = new FinanceInvoicesRepository(tx);
        const invoice = await invoices.findById(id);
        if (!invoice)
          throw new ServiceError("Invoice not found.", 404, "NOT_FOUND");
        if (invoice.status === "VOID") return invoiceShape(invoice);
        if (invoice.payments.length)
          throw new ServiceError(
            "Reverse all completed payments before cancelling the invoice.",
            409,
            "INVOICE_HAS_ACTIVE_PAYMENTS",
          );
        const journal = await tx.journalEntry.findFirst({
          where: {
            sourceType: "finance_invoice",
            sourceId: id,
            deletedAt: null,
          },
        });
        if (!journal)
          throw new ServiceError(
            "Invoice journal entry was not found.",
            409,
            "INVOICE_JOURNAL_MISSING",
          );
        await JournalService.reverseUsing(
          tx,
          journal.id,
          actor,
          "finance_invoice_void",
        );
        const updated = await tx.financeInvoice.update({
          where: { id },
          data: { status: "VOID" },
          include: {
            account: { include: { student: true, registration: true } },
            lines: true,
            payments: {
              where: { payment: { status: "COMPLETED", deletedAt: null } },
            },
          },
        });
        await new AuditRepository(tx).create({
          actorId: actor.id,
          actorRole: actor.role,
          action: "cancel invoice",
          entityType: "finance_invoice",
          entityId: id,
          details: { invoiceNumber: invoice.invoiceNumber, total: money(invoice.total) },
        });
        return invoiceShape(updated);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }
}

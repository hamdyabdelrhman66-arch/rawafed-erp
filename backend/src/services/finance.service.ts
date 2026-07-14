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
  isSaudiNationalId,
  money,
  vatForSubtotal,
  vatRateForStudent,
} from "./student-vat.js";
import { categoryLabel, mappingFor, revenueCategory } from "./revenue-category.js";

const paidForAccount = (account: any) =>
  money(
    account.payments.reduce((n: number, p: any) => n + Number(p.amount), 0),
  );
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
      paid: paidAmount,
      remaining: money(expectedAmount - paidAmount),
    };
  });
  const subtotal = money(feeItems.reduce((sum: number, item: any) => sum + item.subtotal, 0));
  const vat = money(feeItems.reduce((sum: number, item: any) => sum + item.vat, 0));
  return {
    id: a.id,
    registrationId: a.registrationId,
    registrationNumber: a.registration.registrationNumber,
    studentId: a.studentId,
    studentName: a.student.englishName,
    grade: a.student.grade,
    nationalId: a.student.nationalId,
    vatExempt: isSaudiNationalId(a.student.nationalId),
    subtotal,
    vat,
    total: expected,
    expectedTotal: expected,
    paid,
    remaining,
    status: remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid",
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
    feeItem: i.lines[0]?.description || "School Fees",
    category: i.serviceCategory || "LEGACY_COMBINED",
    categoryLabel: categoryLabel(i.serviceCategory || "LEGACY_COMBINED"),
    subtotal: money(i.subtotal),
    amountBeforeVat: money(i.subtotal),
    vat: money(i.vatAmount),
    total,
    totalInvoice: total,
    nationalId: i.account.student.nationalId,
    vatExempt: isSaudiNationalId(i.account.student.nationalId),
    paid,
    remaining: money(Math.max(total - paid, 0)),
    paymentMethod: "",
    accountingAccountId: i.lines[0]?.revenueAccountId || null,
    accountingAccount: i.lines[0]?.revenueAccount ? `${i.lines[0].revenueAccount.code} - ${i.lines[0].revenueAccount.name}` : "",
    costCenterId: i.costCenterId || null,
    branchId: i.branchId || null,
    vatStatus: Number(i.vatAmount) > 0 ? "STANDARD_15" : "EXEMPT",
    legacyCombined: Boolean(i.legacyCombined),
    status: i.status === "VOID" ? "Void" : paid >= total ? "Paid" : paid > 0 ? "Partially Paid" : "Pending",
    issuedAt: i.issuedAt.toISOString(),
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
        branchId: input.branchId || null, taxTreatment: input.taxTreatment || 'STANDARD', active: input.active !== false,
      },
      create: {
        category, revenueAccountId: input.revenueAccountId, costAccountId: input.costAccountId || null,
        receivableAccountId: input.receivableAccountId || null, inventoryAccountId: input.inventoryAccountId || null, costCenterId: input.costCenterId || null,
        branchId: input.branchId || null, taxTreatment: input.taxTreatment || 'STANDARD', active: input.active !== false,
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
  async accounts(skip?: number, take?: number) {
    return (
      await new FinanceAccountsRepository(this.prisma).list(skip, take)
    ).map(accountShape);
  }
  async invoices(skip?: number, take?: number) {
    return (
      await new FinanceInvoicesRepository(this.prisma).list(skip, take)
    ).map(invoiceShape);
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
      const vat = String(account.student.nationalId || "").trim()
        ? vatForSubtotal(subtotal, account.student.nationalId)
        : money(input.vat);
      const total = money(subtotal + vat);
      if (total <= 0 || total !== money(subtotal + vat))
        throw new ServiceError("Invoice totals are invalid.", 422);
      const invoiceNumber = String(
        input.invoiceNumber || `INV-${Date.now()}-${randomUUID().slice(0, 8)}`,
      );
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
      const row = await new FinanceInvoicesRepository(tx).create(
        {
          id: input.id ? String(input.id) : randomUUID(),
          invoiceNumber,
          accountId: account.id,
          registrationId: account.registrationId,
          subtotal,
          vatAmount: vat,
          total,
          issuedAt: new Date(input.date || Date.now()),
        },
        {
          id: randomUUID(),
          description: String(input.feeItem || input.service || "School Fees"),
          quantity: 1,
          unitPrice: subtotal,
          vatRate: subtotal ? money((vat / subtotal) * 100) : 0,
          netAmount: subtotal,
          vatAmount: vat,
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
      const revenue = await tx.chartOfAccount.findUnique({
        where: { systemKey: "tuition-revenue" },
      });
      const vatAccount = vat
        ? await tx.chartOfAccount.findUnique({
            where: { systemKey: "vat-payable" },
          })
        : null;
      if (!customer || !revenue || (vat && !vatAccount))
        throw new ServiceError(
          "Required accounting accounts are not configured.",
          422,
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
            { accountId: customer.receivableAccountId, debit: total },
            { accountId: revenue.id, credit: subtotal },
            ...(vat ? [{ accountId: vatAccount!.id, credit: vat }] : []),
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
    const preview = await new FinanceAccountsRepository(this.prisma).findById(input.accountId);
    if (!preview) throw new ServiceError("Finance account not found.", 404, "NOT_FOUND");
    const categorized = preview.feeItems.some((item: any) => item.serviceCategory && item.serviceCategory !== "LEGACY_COMBINED");
    if (!categorized || input.invoiceId) return this.createPaymentLegacy(input, actor);

    return this.prisma.$transaction(async (tx) => {
      const account = await new FinanceAccountsRepository(tx).findById(input.accountId);
      if (!account) throw new ServiceError("Finance account not found.", 404, "NOT_FOUND");
      const customer = await tx.accountingCustomer.findUnique({ where: { studentId: account.studentId } });
      if (!customer) throw new ServiceError("Student receivable account is not configured.", 422);

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
      if (submittedTotal !== amount) throw new ServiceError("Payment lines do not equal the payment total.", 422);

      const invoiceRepo = new FinanceInvoicesRepository(tx);
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
          const invoiceVat = mapping.taxTreatment === "STANDARD" ? money(categoryItems.reduce(
            (sum: number, item: any) => sum + Number(item.vatAmount ?? vatForSubtotal(Number(item.subtotal ?? item.amount), account.student.nationalId)),
            0,
          )) : 0;
          const invoiceTotal = money(invoiceSubtotal + invoiceVat);
          if (invoiceVat && !vatAccount) throw new ServiceError("VAT payable account is not configured.", 422);
          invoice = await invoiceRepo.create(
            {
              id: randomUUID(),
              invoiceNumber: `INV-${category.slice(0, 4)}-${Date.now()}-${randomUUID().slice(0, 6)}`,
              accountId: account.id,
              registrationId: account.registrationId,
              subtotal: invoiceSubtotal,
              vatAmount: invoiceVat,
              total: invoiceTotal,
              serviceCategory: category,
              costCenterId: mapping.costCenterId,
              branchId: mapping.branchId || account.registration.branchId,
              legacyCombined: false,
              issuedAt: new Date(input.paidAt || Date.now()),
            },
            {
              id: randomUUID(),
              description: categoryItems.map((item: any) => item.name).join(", ") || categoryLabel(category),
              quantity: 1,
              unitPrice: invoiceSubtotal,
              vatRate: invoiceSubtotal ? money((invoiceVat / invoiceSubtotal) * 100) : 0,
              netAmount: invoiceSubtotal,
              vatAmount: invoiceVat,
              totalAmount: invoiceTotal,
              revenueAccountId: mapping.revenue.id,
            },
          );
          openInvoices.push(invoice);
          const outbox = await tx.accountingOutbox.create({
            data: { eventType: "INVOICE_CREATED", aggregateType: "finance_invoice", aggregateId: invoice.id, payload: { invoiceId: invoice.id, category } },
          });
          await JournalService.postUsing(tx, {
            postingDate: invoice.issuedAt,
            description: `${categoryLabel(category)} invoice ${invoice.invoiceNumber}`,
            referenceNumber: invoice.invoiceNumber,
            sourceType: "finance_invoice",
            sourceId: invoice.id,
            invoiceId: invoice.id,
            lines: [
              { accountId: receivableAccountId, debit: invoiceTotal, costCenterId: mapping.costCenterId || undefined },
              { accountId: mapping.revenue.id, credit: invoiceSubtotal, costCenterId: mapping.costCenterId || undefined },
              ...(invoiceVat ? [{ accountId: vatAccount!.id, credit: invoiceVat, costCenterId: mapping.costCenterId || undefined }] : []),
            ],
          }, actor);
          await tx.accountingOutbox.update({ where: { id: outbox.id }, data: { processedAt: new Date() } });
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
      for (const value of affected.values()) {
        const paidAfter = money(value.previousPaid + value.allocated);
        await invoiceRepo.updateStatus(value.invoice.id, paidAfter >= money(value.invoice.total) ? "PAID" : "PARTIALLY_PAID");
      }

      const cashKey = /bank|transfer|card|online/i.test(input.method || "") ? "bank-main" : "cash-main";
      const cash = await tx.chartOfAccount.findUnique({ where: { systemKey: cashKey } });
      if (!cash) throw new ServiceError("Cash or bank account is not configured.", 422);
      const paymentOutbox = await tx.accountingOutbox.create({
        data: { eventType: "PAYMENT_CREATED", aggregateType: "finance_payment", aggregateId: payment.id, payload: { paymentId: payment.id, invoiceIds: invoiceAllocations.map((item) => item.invoiceId) } },
      });
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
  }

  private async createPaymentLegacy(input: PaymentInput, actor: Actor) {
    return this.prisma.$transaction(
      async (tx) => {
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
            422,
          );
        if (!invoice) {
          const shapedAccount = accountShape(account);
          const invoiceTotal = money(shapedAccount.remaining);
          if (invoiceTotal <= 0)
            throw new ServiceError(
              "Student account has no outstanding balance to invoice.",
              422,
            );
          const revenue = await tx.chartOfAccount.findUnique({
            where: { systemKey: "tuition-revenue" },
          });
          if (!revenue)
            throw new ServiceError(
              "Tuition revenue account is not configured.",
              422,
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
            throw new ServiceError("VAT payable account is not configured.", 422);
          const invoiceNumber = `INV-AUTO-${Date.now()}-${randomUUID().slice(0, 8)}`;
          invoice = await invoices.create(
            {
              id: randomUUID(),
              invoiceNumber,
              accountId: account.id,
              registrationId: account.registrationId,
              subtotal: invoiceSubtotal,
              vatAmount: invoiceVat,
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
              422,
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
        await invoices.updateStatus(
          invoice.id,
          amount === remaining ? "PAID" : "PARTIALLY_PAID",
        );
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
        const cash = await tx.chartOfAccount.findUnique({
          where: { systemKey: cashKey },
        });
        if (!cash)
          throw new ServiceError(
            "Cash or bank account is not configured.",
            422,
          );
        const paymentOutbox = await tx.accountingOutbox.create({
          data: {
            eventType: "PAYMENT_CREATED",
            aggregateType: "finance_payment",
            aggregateId: payment.id,
            payload: { paymentId: payment.id, invoiceId: invoice.id },
          },
        });
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

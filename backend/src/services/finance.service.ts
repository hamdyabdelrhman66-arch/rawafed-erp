import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor, PaymentInput } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { FinanceAccountsRepository } from "../repositories/finance-accounts.repository.js";
import { FinanceInvoicesRepository } from "../repositories/finance-invoices.repository.js";
import { FinancePaymentsRepository } from "../repositories/finance-payments.repository.js";
import { ServiceError } from "./service.error.js";
import { JournalService } from "./journal.service.js";

const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
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
      amount: expectedAmount,
      paid: paidAmount,
      remaining: money(expectedAmount - paidAmount),
    };
  });
  return {
    id: a.id,
    registrationId: a.registrationId,
    registrationNumber: a.registration.registrationNumber,
    studentId: a.studentId,
    studentName: a.student.englishName,
    grade: a.student.grade,
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
    amountBeforeVat: money(i.subtotal),
    vat: money(i.vatAmount),
    total,
    paid,
    remaining: money(Math.max(total - paid, 0)),
    paymentMethod: "",
    status: paid >= total ? "Paid" : "Pending",
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
  paymentItem: "School Fees",
  amount: money(p.amount),
  method: p.method,
  paidAt: p.paidAt.toISOString(),
  collectedBy: p.collectedBy || "Finance",
  referenceNumber: p.referenceNumber || undefined,
  notes: p.notes || undefined,
  invoiceId: p.allocations[0]?.invoiceId,
  createdAt: p.createdAt.toISOString(),
});

export class FinanceService {
  constructor(private readonly prisma: PrismaClient) {}
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
      const vat = money(input.vat);
      const total = money(input.total ?? subtotal + vat);
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
        const customer = await tx.accountingCustomer.findUnique({
          where: { studentId: account.studentId },
        });
        if (!customer)
          throw new ServiceError(
            "Student receivable account is not configured.",
            422,
          );
        if (!invoice)
          throw new ServiceError(
            "Payment must reference an existing open invoice.",
            422,
            "INVOICE_REQUIRED",
          );
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
          paidAt: new Date(input.paidAt || Date.now()),
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
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

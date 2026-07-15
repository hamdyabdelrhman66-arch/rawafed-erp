import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AccountingExpensesRepository } from "../repositories/accounting-expenses.repository.js";
import { AccountsRepository } from "../repositories/accounts.repository.js";
import { SuppliersRepository } from "../repositories/parties.repository.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";

export class AccountingExpenseService {
  constructor(private readonly prisma: PrismaClient) {}
  list() {
    return new AccountingExpensesRepository(this.prisma).list();
  }
  async get(id: string) {
    const row = await new AccountingExpensesRepository(this.prisma).find(id);
    if (!row) throw new ServiceError("Expense was not found.", 404, "EXPENSE_NOT_FOUND");
    return row;
  }
  async create(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const subtotal = Math.round(Number(input.amountBeforeVat ?? input.amount ?? 0) * 100) / 100,
        vatTreatment = String(input.vatTreatment || (Number(input.vatRate) > 0 ? "STANDARD" : "EXEMPT")).toUpperCase(),
        vat = vatTreatment === "STANDARD" ? Math.round(subtotal * 15) / 100 : 0,
        total = Math.round((subtotal + vat) * 100) / 100;
      if (total <= 0)
        throw new ServiceError("Expense amount must be positive.", 422);
      const expenseAccount = await new AccountsRepository(tx).find(
        input.expenseAccountId,
      );
      if (!expenseAccount || expenseAccount.type !== "EXPENSE")
        throw new ServiceError("Expense account not found.", 422);
      const lines: any[] = [
        {
          accountId: expenseAccount.id,
          debit: subtotal,
          costCenterId: input.costCenterId,
        },
      ];
      if (vat) {
        const vatInput = await new AccountsRepository(tx).system("vat-input");
        if (!vatInput)
          throw new ServiceError("Input VAT account is not configured.", 422);
        lines.push({ accountId: vatInput.id, debit: vat });
      }
      const requestedPaymentStatus = String(input.paymentStatus || "Unpaid");
      const paidAmount =
        requestedPaymentStatus === "Paid"
          ? total
          : requestedPaymentStatus === "Unpaid"
            ? 0
            : Number(input.paidAmount || 0);
      if (paidAmount < 0 || paidAmount > total)
        throw new ServiceError("Paid amount is invalid.", 422);
      let supplier: any = null;
      if (paidAmount < total) {
        if (!input.supplierId)
          throw new ServiceError(
            "Supplier is required for unpaid or partially paid expense.",
            422,
          );
        supplier = await new SuppliersRepository(tx).find(input.supplierId);
        if (!supplier) throw new ServiceError("Supplier not found.", 404);
      }
      if (paidAmount > 0) {
        if (!input.paymentFromAccountId)
          throw new ServiceError("Cash or bank payment account is required.", 422);
        const paymentAccount = await tx.chartOfAccount.findFirst({ where: {
          id: input.paymentFromAccountId, active: true, deletedAt: null, allowPosting: true,
          OR: [{ isCashAccount: true }, { isBankAccount: true }],
        } });
        if (!paymentAccount)
          throw new ServiceError("A valid cash or bank account is required.", 422, "PAYMENT_ACCOUNT_MISSING");
        lines.push({ accountId: paymentAccount.id, credit: paidAmount });
      }
      const unpaidAmount = Math.round((total - paidAmount) * 100) / 100;
      if (unpaidAmount > 0)
        lines.push({ accountId: supplier.payableAccountId, credit: unpaidAmount });
      const expenseNo = input.expenseNo || `EXP-${Date.now()}`;
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: input.expenseDate || input.date || new Date(),
          description: input.description || input.title || "Expense",
          referenceNumber: expenseNo,
          sourceType: "accounting_expense",
          sourceId: input.idempotencyKey || expenseNo,
          lines,
        },
        actor,
      );
      const normalizedStatus = paidAmount >= total ? "Paid" : paidAmount > 0 ? "Partial" : "Unpaid";
      const expense = await new AccountingExpensesRepository(tx).create({
        expenseNo,
        supplierId: input.supplierId,
        expenseAccountId: expenseAccount.id,
        invoiceType: input.invoiceType || "Tax Invoice",
        supplierInvoiceNumber: input.supplierInvoiceNumber,
        description: input.description || input.title || "Expense",
        costCenterId: input.costCenterId,
        amountBeforeVat: subtotal,
        vatRate: vatTreatment === "STANDARD" ? 15 : 0,
        vatAmount: vat,
        totalAmount: total,
        paidAmount,
        paymentStatus: normalizedStatus,
        paymentMethod: input.paymentMethod,
        paymentAccountId: input.paymentFromAccountId,
        journalEntryId: journal.id,
        expenseDate: new Date(input.expenseDate || input.date || Date.now()),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        branchId: input.branchId || null,
        vatTreatment,
        referenceNumber: input.referenceNumber || input.reference || null,
        attachmentUrl: input.attachmentUrl || null,
        recurring: input.recurring === true,
        createdById: actor.id,
        notes: input.notes,
      });
      if (paidAmount > 0) await tx.accountingExpensePayment.create({ data: {
        expenseId: expense.id,
        amount: paidAmount,
        paymentDate: expense.expenseDate,
        paymentMethod: input.paymentMethod || "Cash",
        paymentAccountId: input.paymentFromAccountId,
        referenceNumber: input.referenceNumber || input.reference || null,
        journalEntryId: journal.id,
        idempotencyKey: input.idempotencyKey || `expense-initial:${expense.id}`,
        createdById: actor.id,
      } });
      return new AccountingExpensesRepository(tx).find(expense.id);
    });
  }
  async pay(id: string, input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.accountingExpensePayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (duplicate) return duplicate;
      const expense = await new AccountingExpensesRepository(tx).find(id);
      if (!expense) throw new ServiceError("Expense was not found.", 404, "EXPENSE_NOT_FOUND");
      if (!expense.supplier?.payableAccountId) throw new ServiceError("Supplier payable account is required.", 422, "SUPPLIER_PAYABLE_MISSING");
      const remaining = Math.round((Number(expense.totalAmount) - Number(expense.paidAmount)) * 100) / 100;
      const amount = Math.round(Number(input.amount || remaining) * 100) / 100;
      if (amount <= 0 || amount > remaining) throw new ServiceError("Expense payment exceeds the remaining balance.", 422, "INVALID_EXPENSE_PAYMENT");
      const paymentAccount = await tx.chartOfAccount.findFirst({ where: {
        id: input.paymentAccountId, active: true, deletedAt: null, allowPosting: true,
        OR: [{ isCashAccount: true }, { isBankAccount: true }],
      } });
      if (!paymentAccount) throw new ServiceError("A valid cash or bank account is required.", 422, "PAYMENT_ACCOUNT_MISSING");
      const paymentDate = new Date(input.paymentDate || Date.now());
      const journal = await JournalService.postUsing(tx, {
        postingDate: paymentDate, description: `Expense payment ${expense.expenseNo}`,
        referenceNumber: input.referenceNumber || expense.expenseNo,
        sourceType: "accounting_expense_payment", sourceId: input.idempotencyKey,
        lines: [{ accountId: expense.supplier.payableAccountId, debit: amount }, { accountId: paymentAccount.id, credit: amount }],
      }, actor);
      const payment = await tx.accountingExpensePayment.create({ data: {
        expenseId: expense.id, amount, paymentDate, paymentMethod: input.paymentMethod || "Bank Transfer",
        paymentAccountId: paymentAccount.id, referenceNumber: input.referenceNumber || null,
        journalEntryId: journal.id, idempotencyKey: input.idempotencyKey, createdById: actor.id,
      } });
      const paidAmount = Math.round((Number(expense.paidAmount) + amount) * 100) / 100;
      await tx.accountingExpense.update({ where: { id }, data: {
        paidAmount, paymentStatus: paidAmount >= Number(expense.totalAmount) ? "Paid" : "Partial",
        paymentMethod: input.paymentMethod || expense.paymentMethod,
      } });
      return { ...payment, amount: Number(payment.amount), journalEntryNo: journal.entryNumber };
    });
  }
}

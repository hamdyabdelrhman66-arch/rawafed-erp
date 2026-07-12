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
  async create(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const subtotal = Number(input.amountBeforeVat ?? input.amount ?? 0),
        vat = Number(input.vatAmount ?? 0),
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
      let creditAccountId = input.paymentFromAccountId;
      if (input.paymentStatus === "Unpaid") {
        if (!input.supplierId)
          throw new ServiceError(
            "Supplier is required for unpaid expense.",
            422,
          );
        const supplier = await new SuppliersRepository(tx).find(
          input.supplierId,
        );
        if (!supplier) throw new ServiceError("Supplier not found.", 404);
        creditAccountId = supplier.payableAccountId;
      }
      if (!creditAccountId)
        throw new ServiceError("Payment or payable account is required.", 422);
      lines.push({ accountId: creditAccountId, credit: total });
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
      return new AccountingExpensesRepository(tx).create({
        expenseNo,
        supplierId: input.supplierId,
        expenseAccountId: expenseAccount.id,
        invoiceType: input.invoiceType || "Tax Invoice",
        supplierInvoiceNumber: input.supplierInvoiceNumber,
        description: input.description || input.title || "Expense",
        costCenterId: input.costCenterId,
        amountBeforeVat: subtotal,
        vatRate: Number(input.vatRate || 0),
        vatAmount: vat,
        totalAmount: total,
        paymentStatus: input.paymentStatus || "Paid",
        paymentMethod: input.paymentMethod,
        paymentAccountId: input.paymentFromAccountId,
        journalEntryId: journal.id,
        expenseDate: new Date(input.expenseDate || input.date || Date.now()),
        notes: input.notes,
      });
    });
  }
}

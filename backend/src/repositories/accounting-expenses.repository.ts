import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class AccountingExpensesRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.accountingExpense.findMany({
      where: { deletedAt: null },
      include: { supplier: true, expenseAccount: true, journalEntry: true, costCenter: true, payments: true },
      orderBy: { expenseDate: "desc" },
    });
  }
  find(id: string) {
    return this.db.accountingExpense.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true, expenseAccount: true, journalEntry: true, costCenter: true, payments: true },
    });
  }
  create(data: Prisma.AccountingExpenseUncheckedCreateInput) {
    return this.db.accountingExpense.create({ data });
  }
  withoutJournal() {
    return this.db.accountingExpense.findMany({
      where: {
        OR: [
          { journalEntryId: { equals: undefined } as never },
          { journalEntry: { is: { status: { not: "POSTED" } } } },
        ],
      },
      select: { id: true, expenseNo: true },
    });
  }
}
export class AccountingPaymentsRepository {
  constructor(private readonly db: DatabaseClient) {}
  createSupplier(data: Prisma.SupplierPaymentUncheckedCreateInput) {
    return this.db.supplierPayment.create({ data });
  }
  createCustomer(data: Prisma.CustomerPaymentUncheckedCreateInput) {
    return this.db.customerPayment.create({ data });
  }
}

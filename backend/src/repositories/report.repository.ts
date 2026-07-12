import type { DatabaseClient } from "./repository.types.js";
export class ReportRepository {
  constructor(private readonly db: DatabaseClient) {}
  registrations(from?: Date, to?: Date) {
    return this.db.registration.findMany({
      where: { deletedAt: null, submittedAt: { gte: from, lte: to } },
      orderBy: { submittedAt: "desc" },
    });
  }
  payments(from?: Date, to?: Date) {
    return this.db.financePayment.findMany({
      where: {
        deletedAt: null,
        status: "COMPLETED",
        paidAt: { gte: from, lte: to },
      },
      include: {
        account: { include: { registration: true, student: true } },
        allocations: true,
      },
      orderBy: { paidAt: "desc" },
    });
  }
  expenses(from?: Date, to?: Date) {
    return this.db.accountingExpense.findMany({
      where: {
        deletedAt: null,
        status: "posted",
        expenseDate: { gte: from, lte: to },
      },
      orderBy: { expenseDate: "desc" },
    });
  }
  accounts() {
    return this.db.financeAccount.findMany({
      where: { deletedAt: null },
      include: {
        registration: true,
        student: true,
        feeItems: true,
        payments: { where: { deletedAt: null, status: "COMPLETED" } },
      },
    });
  }
}

import type { DatabaseClient } from "./repository.types.js";
export class AdminRepository {
  constructor(private readonly db: DatabaseClient) {}
  async exportAll() {
    const [
      users,
      registrations,
      students,
      notifications,
      financeAccounts,
      financePayments,
      financeInvoices,
      financeExpenses,
      staff,
      uploads,
      settings,
      auditLogs,
      refreshTokens,
    ] = await Promise.all([
      this.db.user.findMany({ include: { role: true } }),
      this.db.registration.findMany(),
      this.db.student.findMany(),
      this.db.notification.findMany(),
      this.db.financeAccount.findMany({ include: { feeItems: true } }),
      this.db.financePayment.findMany({ include: { allocations: true } }),
      this.db.financeInvoice.findMany({
        include: { lines: true, payments: true },
      }),
      this.db.financeExpense.findMany(),
      this.db.staff.findMany(),
      this.db.uploadedFile.findMany(),
      this.db.setting.findMany(),
      this.db.auditLog.findMany(),
      this.db.refreshToken.findMany(),
    ]);
    return {
      users,
      registrations,
      students,
      notifications,
      financeAccounts,
      financePayments,
      financeInvoices,
      financeExpenses,
      staff,
      uploads,
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      auditLogs,
      refreshTokens,
    };
  }
  async integrity() {
    const [
      countRegistrations,
      countStudents,
      countAccounts,
      countInvoices,
      countPayments,
      countExpenses,
      countAudit,
      studentsWithoutRegistration,
      accountsWithoutStudent,
      paymentsWithoutAccount,
      invoicesWithoutAccount,
    ] = await Promise.all([
      this.db.registration.count({ where: { deletedAt: null } }),
      this.db.student.count({ where: { deletedAt: null } }),
      this.db.financeAccount.count({ where: { deletedAt: null } }),
      this.db.financeInvoice.count({ where: { deletedAt: null } }),
      this.db.financePayment.count({ where: { deletedAt: null } }),
      this.db.financeExpense.count({ where: { deletedAt: null } }),
      this.db.auditLog.count(),
      this.db.student.findMany({
        where: { deletedAt: null, registrationId: null },
        select: { id: true },
      }),
      this.db.financeAccount.findMany({
        where: { deletedAt: null, student: { deletedAt: { not: null } } },
        select: { id: true },
      }),
      this.db.financePayment.findMany({
        where: { deletedAt: null, account: { deletedAt: { not: null } } },
        select: { id: true },
      }),
      this.db.financeInvoice.findMany({
        where: { deletedAt: null, account: { deletedAt: { not: null } } },
        select: { id: true },
      }),
    ]);
    const invoice = await this.db.financeInvoice.aggregate({
        where: { deletedAt: null },
        _sum: { total: true },
      }),
      payment = await this.db.financePayment.aggregate({
        where: { deletedAt: null, status: "COMPLETED" },
        _sum: { amount: true },
      }),
      accounts = await this.db.financeAccount.findMany({
        where: { deletedAt: null },
        include: {
          payments: { where: { deletedAt: null, status: "COMPLETED" } },
        },
      });
    return {
      counts: {
        registrations: countRegistrations,
        students: countStudents,
        financeAccounts: countAccounts,
        invoices: countInvoices,
        payments: countPayments,
        expenses: countExpenses,
        auditLogs: countAudit,
      },
      duplicates: {
        registrationNumbers: [],
        receiptNumbers: [],
        invoiceNumbers: [],
      },
      orphanRecords: {
        studentsWithoutRegistration,
        accountsWithoutRegistration: [],
        accountsWithoutStudent,
        paymentsWithoutAccount,
        paymentsWithoutInvoice: [],
        paymentsWithoutRegistration: [],
        invoicesWithoutAccount,
        invoicesWithoutRegistration: [],
      },
      totals: {
        invoiceTotal: Number(invoice._sum.total || 0),
        paymentTotal: Number(payment._sum.amount || 0),
        outstandingTotal: accounts.reduce(
          (n, a) =>
            n +
            Math.max(
              Number(a.expectedTotal) -
                a.payments.reduce((s, p) => s + Number(p.amount), 0),
              0,
            ),
          0,
        ),
        accountExpectedTotal: accounts.reduce(
          (n, a) => n + Number(a.expectedTotal),
          0,
        ),
        accountPaidTotal: accounts.reduce(
          (n, a) => n + a.payments.reduce((s, p) => s + Number(p.amount), 0),
          0,
        ),
      },
    };
  }
}

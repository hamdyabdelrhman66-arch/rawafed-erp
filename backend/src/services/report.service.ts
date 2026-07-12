import type { PrismaClient } from "@prisma/client";
import { ReportRepository } from "../repositories/report.repository.js";
import { FinancialStatementsService } from "./financial-statements.service.js";
const money = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;
const dates = (from?: string, to?: string) => ({
  from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
  to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
});
const reg = (r: any) => ({
  ...r.data,
  id: r.id,
  registrationNumber: r.registrationNumber,
  status: r.status,
  submittedAt: r.submittedAt?.toISOString(),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
const payment = (p: any) => ({
  id: p.id,
  accountId: p.accountId,
  registrationId: p.registrationId,
  registrationNumber: p.account.registration.registrationNumber,
  receiptNumber: p.receiptNumber,
  paymentItem: "School Fees",
  amount: Number(p.amount),
  method: p.method,
  paidAt: p.paidAt.toISOString(),
  collectedBy: p.collectedBy || "Finance",
  referenceNumber: p.referenceNumber || undefined,
  notes: p.notes || undefined,
  invoiceId: p.allocations[0]?.invoiceId,
  createdAt: p.createdAt.toISOString(),
});
const account = (a: any) => {
  const paid = a.payments.reduce(
      (n: number, p: any) => n + Number(p.amount),
      0,
    ),
    expected = Number(a.expectedTotal),
    remaining = Math.max(expected - paid, 0);
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
    feeItems: a.feeItems.map((f: any) => ({
      name: f.name,
      amount: Number(f.amount),
    })),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
};
export class ReportService {
  constructor(private readonly prisma: PrismaClient) {}
  async admissions(from?: string, to?: string) {
    const rows = (
      await new ReportRepository(this.prisma).registrations(
        ...(Object.values(dates(from, to)) as [
          Date | undefined,
          Date | undefined,
        ]),
      )
    ).map(reg);
    return {
      from,
      to,
      total: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      unpaid: rows.filter((r) => r.financial?.paymentStatus === "Unpaid")
        .length,
      rows,
    };
  }
  async finance(from?: string, to?: string) {
    const d = dates(from, to),
      repo = new ReportRepository(this.prisma),
      payments = (await repo.payments(d.from, d.to)).map(payment),
      expenses = await repo.expenses(d.from, d.to),
      accounts = (await repo.accounts()).map(account),
      collected = payments.reduce((n, p) => n + p.amount, 0),
      statements = new FinancialStatementsService(this.prisma),
      [incomeStatement, dashboard] = await Promise.all([
        statements.incomeStatement(from, to),
        statements.dashboard(from, to),
      ]);
    return {
      from,
      to,
      collected: money(collected),
      revenue: incomeStatement.revenue,
      expenseTotal: incomeStatement.expenses,
      net: incomeStatement.netIncome,
      outstanding: dashboard.kpis.accountsReceivable,
      payments,
      expenses,
      reconciliation: {
        trialBalanceBalanced: dashboard.trialBalance.balanced,
        balanceSheetBalanced: dashboard.balanceSheet.balanced,
      },
    };
  }
  async outstanding() {
    const accounts = (await new ReportRepository(this.prisma).accounts())
      .map(account)
      .filter((a) => a.remaining > 0);
    return {
      totalOutstanding: money(accounts.reduce((n, a) => n + a.remaining, 0)),
      accounts,
    };
  }
  async daily(day: string) {
    const d = dates(day, day),
      payments = (
        await new ReportRepository(this.prisma).payments(d.from, d.to)
      ).map(payment);
    return {
      date: day,
      total: money(payments.reduce((n, p) => n + p.amount, 0)),
      payments,
    };
  }
  async monthly(month: string) {
    const from = `${month}-01`,
      end = new Date(`${from}T00:00:00.000Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    const to = end.toISOString().slice(0, 10),
      payments = (
        await new ReportRepository(this.prisma).payments(
          dates(from, to).from,
          dates(from, to).to,
        )
      ).map(payment);
    return {
      month,
      total: money(payments.reduce((n, p) => n + p.amount, 0)),
      payments,
    };
  }
}

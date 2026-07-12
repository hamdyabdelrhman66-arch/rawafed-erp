import type { AccountType, PrismaClient } from "@prisma/client";
import { AccountsRepository } from "../repositories/accounts.repository.js";
import { LedgerRepository } from "../repositories/ledger.repository.js";
import { AccountingSearchRepository } from "../repositories/accounting-search.repository.js";

const num = (v: unknown) => Number(v || 0);
const round = (v: number) => Math.round(v * 100) / 100;
export class FinancialStatementsService {
  constructor(private readonly prisma: PrismaClient) {}
  private dates(from?: string, to?: string) {
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
  }
  async trialBalance(from?: string, to?: string) {
    const dates = this.dates(from, to);
    const [accounts, balances] = await Promise.all([
      new AccountsRepository(this.prisma).list(),
      new LedgerRepository(this.prisma).balances(dates),
    ]);
    const map = new Map(
      balances.map((b) => [
        b.accountId,
        { debit: num(b._sum.debit), credit: num(b._sum.credit) },
      ]),
    );
    const rows = accounts
      .map((a) => ({
        accountId: a.id,
        code: a.code,
        nameAr: a.nameAr,
        nameEn: a.name,
        accountType: a.type.toLowerCase(),
        debit: round(map.get(a.id)?.debit || 0),
        credit: round(map.get(a.id)?.credit || 0),
        balance: round(
          (map.get(a.id)?.debit || 0) - (map.get(a.id)?.credit || 0),
        ),
      }))
      .filter((r) => r.debit || r.credit);
    const totalDebit = round(rows.reduce((n, r) => n + r.debit, 0)),
      totalCredit = round(rows.reduce((n, r) => n + r.credit, 0));
    return {
      rows,
      totalDebit,
      totalCredit,
      balanced: totalDebit === totalCredit,
      fromDate: from || "",
      toDate: to || "",
    };
  }
  async ledger(accountId: string, from?: string, to?: string) {
    const account = await new AccountsRepository(this.prisma).find(accountId);
    const lines = await new LedgerRepository(this.prisma).lines({
      accountId,
      ...this.dates(from, to),
    });
    let balance = 0;
    return {
      account,
      entries: lines.map((line) => {
        balance = round(balance + num(line.debit) - num(line.credit));
        return {
          id: line.id,
          journalEntryId: line.journalEntryId,
          entryNumber: line.journalEntry.entryNumber,
          postingDate: line.journalEntry.postingDate.toISOString().slice(0, 10),
          description: line.description || line.journalEntry.description,
          debit: num(line.debit),
          credit: num(line.credit),
          balance,
        };
      }),
      closingBalance: balance,
    };
  }
  async incomeStatement(from?: string, to?: string) {
    const balances = await new LedgerRepository(this.prisma).balances({
      ...this.dates(from, to),
      accountTypes: ["REVENUE", "EXPENSE"] as AccountType[],
    });
    const accounts = await new AccountsRepository(this.prisma).list({
      type: { in: ["REVENUE", "EXPENSE"] },
    });
    const map = new Map(accounts.map((a) => [a.id, a]));
    let revenue = 0,
      expenses = 0;
    for (const b of balances) {
      const a = map.get(b.accountId);
      if (a?.type === "REVENUE")
        revenue += num(b._sum.credit) - num(b._sum.debit);
      if (a?.type === "EXPENSE")
        expenses += num(b._sum.debit) - num(b._sum.credit);
    }
    return {
      revenue: round(revenue),
      expenses: round(expenses),
      netIncome: round(revenue - expenses),
    };
  }
  async balanceSheet(to?: string) {
    const tb = await this.trialBalance(undefined, to);
    const totals: any = { asset: 0, liability: 0, equity: 0 };
    for (const row of tb.rows)
      if (row.accountType === "asset") totals.asset += row.balance;
      else if (row.accountType === "liability" || row.accountType === "equity")
        totals[row.accountType] += -row.balance;
    const retained = (await this.incomeStatement(undefined, to)).netIncome;
    return {
      assets: round(totals.asset),
      liabilities: round(totals.liability),
      equity: round(totals.equity + retained),
      balanced:
        round(totals.asset) ===
        round(totals.liability + totals.equity + retained),
    };
  }
  async cashFlow(from?: string, to?: string) {
    const lines = await new LedgerRepository(this.prisma).lines({
      ...this.dates(from, to),
      accountTypes: ["ASSET"],
    });
    const cash = lines.filter(
      (l) => l.account.isCashAccount || l.account.isBankAccount,
    );
    return {
      inflows: round(cash.reduce((n, l) => n + num(l.debit), 0)),
      outflows: round(cash.reduce((n, l) => n + num(l.credit), 0)),
      netCashFlow: round(
        cash.reduce((n, l) => n + num(l.debit) - num(l.credit), 0),
      ),
    };
  }
  async dashboard(from?: string, to?: string) {
    const [trialBalance, incomeStatement, balanceSheet, cashFlow] =
      await Promise.all([
        this.trialBalance(from, to),
        this.incomeStatement(from, to),
        this.balanceSheet(to),
        this.cashFlow(from, to),
      ]);
    return { trialBalance, incomeStatement, balanceSheet, cashFlow };
  }
  search(query: string) {
    return new AccountingSearchRepository(this.prisma).search(query);
  }
}

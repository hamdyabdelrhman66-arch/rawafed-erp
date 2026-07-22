import type { AccountType, Prisma, PrismaClient } from "@prisma/client";
import { AccountsRepository } from "../repositories/accounts.repository.js";
import { LedgerRepository } from "../repositories/ledger.repository.js";
import { AccountingSearchRepository } from "../repositories/accounting-search.repository.js";

const num = (v: unknown) => Number(v || 0);
const round = (v: number) => Math.round(v * 100) / 100;

export interface TrialBalanceFilters {
  fromDate?: string;
  toDate?: string;
  displayMode?: "activity" | "balance" | "all";
  accountType?: string;
  parentAccountId?: string;
  branch?: string;
  costCenterId?: string;
  currency?: string;
  accountStatus?: string;
  search?: string;
  showZeroBalances?: boolean;
  showParentAccounts?: boolean;
}

const splitBalance = (value: number) => ({
  debit: value > 0 ? round(value) : 0,
  credit: value < 0 ? round(-value) : 0,
});

export class FinancialStatementsService {
  constructor(private readonly prisma: PrismaClient) {}
  private dates(from?: string, to?: string) {
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
  }
  async trialBalance(
    filtersOrFrom: TrialBalanceFilters | string = {},
    legacyTo?: string,
  ) {
    const filters: TrialBalanceFilters =
      typeof filtersOrFrom === "string"
        ? { fromDate: filtersOrFrom, toDate: legacyTo }
        : filtersOrFrom;
    const from = filters.fromDate ? new Date(filters.fromDate) : undefined;
    const to = filters.toDate ? new Date(filters.toDate) : undefined;
    const accountWhere: Prisma.ChartOfAccountWhereInput = {};
    if (filters.accountType) {
      accountWhere.type = filters.accountType.toUpperCase() as AccountType;
    }
    if (filters.parentAccountId) accountWhere.parentId = filters.parentAccountId;
    if (filters.currency) accountWhere.currency = filters.currency.toUpperCase();
    if (filters.accountStatus === "active") accountWhere.active = true;
    if (["inactive", "archived"].includes(filters.accountStatus || "")) {
      accountWhere.active = false;
    }
    if (filters.search) {
      accountWhere.OR = [
        { code: { contains: filters.search, mode: "insensitive" } },
        { name: { contains: filters.search, mode: "insensitive" } },
        { nameAr: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const branchFilter = filters.branch
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.branch)
        ? { branchId: filters.branch }
        : { branch: { code: { equals: filters.branch, mode: "insensitive" as const } } }
      : {};
    const lineFilter: Prisma.JournalLineWhereInput = {
      costCenterId: filters.costCenterId || undefined,
      currency: filters.currency ? filters.currency.toUpperCase() : undefined,
      journalEntry: {
        status: { in: ["POSTED", "REVERSED"] },
        deletedAt: null,
        ...branchFilter,
      },
    };
    const periodWhere: Prisma.JournalLineWhereInput = {
      ...lineFilter,
      journalEntry: {
        ...(lineFilter.journalEntry as Prisma.JournalEntryWhereInput),
        postingDate: { gte: from, lte: to },
      },
    };
    const openingWhere: Prisma.JournalLineWhereInput | undefined = from
      ? {
          ...lineFilter,
          journalEntry: {
            ...(lineFilter.journalEntry as Prisma.JournalEntryWhereInput),
            postingDate: { lt: from },
          },
        }
      : undefined;

    const [accounts, periodBalances, priorBalances] = await Promise.all([
      new AccountsRepository(this.prisma).list(accountWhere),
      this.prisma.journalLine.groupBy({
        by: ["accountId"],
        where: periodWhere,
        _sum: { debit: true, credit: true },
      }),
      openingWhere
        ? this.prisma.journalLine.groupBy({
            by: ["accountId"],
            where: openingWhere,
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve([]),
    ]);
    const periodMap = new Map(periodBalances.map((b) => [b.accountId, b._sum]));
    const priorMap = new Map(priorBalances.map((b) => [b.accountId, b._sum]));
    const childCount = new Map<string, number>();
    for (const account of accounts) {
      if (account.parentId) childCount.set(account.parentId, (childCount.get(account.parentId) || 0) + 1);
    }

    const allRows = accounts.map((account) => {
      const configuredOpening =
        !account.openingDate || !from || account.openingDate <= from
          ? num(account.openingBalance) * (account.normalBalance.toUpperCase() === "CREDIT" ? -1 : 1)
          : 0;
      const prior = priorMap.get(account.id);
      const period = periodMap.get(account.id);
      const openingBalance = round(configuredOpening + num(prior?.debit) - num(prior?.credit));
      const periodDebit = round(num(period?.debit));
      const periodCredit = round(num(period?.credit));
      const closingBalance = round(openingBalance + periodDebit - periodCredit);
      const opening = splitBalance(openingBalance);
      const closing = splitBalance(closingBalance);
      return {
        accountId: account.id,
        parentId: account.parentId,
        code: account.code,
        nameAr: account.nameAr,
        nameEn: account.name,
        accountType: account.type.toLowerCase(),
        isParent: childCount.has(account.id),
        level: account.parentId ? 1 : 0,
        openingBalance,
        openingDebit: opening.debit,
        openingCredit: opening.credit,
        periodDebit,
        periodCredit,
        closingBalance,
        closingDebit: closing.debit,
        closingCredit: closing.credit,
        // Backwards-compatible fields used by the dashboard and balance sheet.
        debit: periodDebit,
        credit: periodCredit,
        balance: closingBalance,
      };
    });
    const displayMode = filters.showZeroBalances ? "all" : filters.displayMode || "activity";
    const rows = allRows.filter((row) => {
      if (displayMode === "all") return true;
      if (displayMode === "balance") return row.closingBalance !== 0;
      return row.periodDebit !== 0 || row.periodCredit !== 0;
    });
    const totals = {
      openingDebit: round(rows.reduce((sum, row) => sum + row.openingDebit, 0)),
      openingCredit: round(rows.reduce((sum, row) => sum + row.openingCredit, 0)),
      periodDebit: round(rows.reduce((sum, row) => sum + row.periodDebit, 0)),
      periodCredit: round(rows.reduce((sum, row) => sum + row.periodCredit, 0)),
      closingDebit: round(rows.reduce((sum, row) => sum + row.closingDebit, 0)),
      closingCredit: round(rows.reduce((sum, row) => sum + row.closingCredit, 0)),
    };
    const totalDebit = totals.periodDebit;
    const totalCredit = totals.periodCredit;
    return {
      rows,
      totals,
      totalDebit,
      totalCredit,
      balanced: totalDebit === totalCredit,
      fromDate: filters.fromDate || "",
      toDate: filters.toDate || "",
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
          referenceNumber: line.journalEntry.referenceNumber,
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
    const tb = await this.trialBalance({ toDate: to, displayMode: "balance" });
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
    const [
      trialBalance,
      incomeStatement,
      balanceSheet,
      cashFlow,
      accounts,
      balances,
    ] = await Promise.all([
      this.trialBalance(from, to),
      this.incomeStatement(from, to),
      this.balanceSheet(to),
      this.cashFlow(from, to),
      new AccountsRepository(this.prisma).list(),
      new LedgerRepository(this.prisma).balances(this.dates(from, to)),
    ]);
    const accountMap = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const naturalBalance = (
      account: (typeof accounts)[number],
      debit: number,
      credit: number,
    ) =>
      account.type === "ASSET" || account.type === "EXPENSE"
        ? debit - credit
        : credit - debit;
    const totals = {
      cashBalance: 0,
      bankBalance: 0,
      accountsReceivable: 0,
      accountsPayable: 0,
      vatPayable: 0,
    };
    for (const balance of balances) {
      const account = accountMap.get(balance.accountId);
      if (!account) continue;
      const value = round(
        naturalBalance(
          account,
          num(balance._sum.debit),
          num(balance._sum.credit),
        ),
      );
      if (account.isCashAccount) totals.cashBalance += value;
      if (account.isBankAccount) totals.bankBalance += value;
      if (account.isReceivableAccount) totals.accountsReceivable += value;
      if (account.isPayableAccount) totals.accountsPayable += value;
      if (account.isVatAccount) totals.vatPayable += value;
    }
    const kpis = {
      cashBalance: round(totals.cashBalance),
      bankBalance: round(totals.bankBalance),
      accountsReceivable: round(totals.accountsReceivable),
      accountsPayable: round(totals.accountsPayable),
      vatPayable: round(totals.vatPayable),
      currentAssets: round(balanceSheet.assets),
      revenue: incomeStatement.revenue,
      expenses: incomeStatement.expenses,
      netProfit: incomeStatement.netIncome,
    };
    return { trialBalance, incomeStatement, balanceSheet, cashFlow, kpis };
  }
  search(query: string) {
    return new AccountingSearchRepository(this.prisma).search(query);
  }
}

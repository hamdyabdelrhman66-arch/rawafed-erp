import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

const accountSelect = {
  id: true,
  code: true,
  name: true,
  nameAr: true,
  active: true,
  notes: true,
  openingBalance: true,
  openingDate: true,
  normalBalance: true,
  isCashAccount: true,
  isBankAccount: true,
} as const;

export class CashBankRepository {
  constructor(private readonly db: DatabaseClient) {}

  cashboxes() {
    return this.db.cashbox.findMany({
      where: { deletedAt: null },
      include: { account: { select: accountSelect } },
      orderBy: { name: "asc" },
    });
  }

  banks() {
    return this.db.bank.findMany({
      where: { deletedAt: null },
      include: { account: { select: accountSelect } },
      orderBy: { bankName: "asc" },
    });
  }

  cashAccounts() {
    return this.paymentAccounts({ isCashAccount: true });
  }

  bankAccounts() {
    return this.paymentAccounts({ isBankAccount: true });
  }

  accountBalances(accountIds: string[]) {
    if (!accountIds.length) return Promise.resolve([]);
    return this.db.journalLine.groupBy({
      by: ["accountId"],
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          status: { in: ["POSTED", "REVERSED"] },
          deletedAt: null,
        },
      },
      _sum: { debit: true, credit: true },
      _count: { journalEntryId: true },
    });
  }

  findLiveMapping(accountId: string) {
    return Promise.all([
      this.db.cashbox.findFirst({ where: { accountId, deletedAt: null } }),
      this.db.bank.findFirst({ where: { accountId, deletedAt: null } }),
    ]);
  }

  createCashbox(data: Prisma.CashboxUncheckedCreateInput) {
    return this.db.cashbox.create({ data, include: { account: true } });
  }
  createBank(data: Prisma.BankUncheckedCreateInput) {
    return this.db.bank.create({ data, include: { account: true } });
  }
  updateCashbox(id: string, data: Prisma.CashboxUncheckedUpdateInput) {
    return this.db.cashbox.update({ where: { id }, data, include: { account: true } });
  }
  updateBank(id: string, data: Prisma.BankUncheckedUpdateInput) {
    return this.db.bank.update({ where: { id }, data, include: { account: true } });
  }
  createTransfer(data: Prisma.CashBankTransferUncheckedCreateInput) {
    return this.db.cashBankTransfer.create({ data });
  }

  private paymentAccounts(flag: { isCashAccount: true } | { isBankAccount: true }) {
    return this.db.chartOfAccount.findMany({
      where: { ...flag, active: true, deletedAt: null },
      select: accountSelect,
      orderBy: { code: "asc" },
    });
  }
}

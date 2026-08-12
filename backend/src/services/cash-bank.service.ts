import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { CashBankRepository } from "../repositories/cash-bank.repository.js";
import type { DatabaseClient } from "../repositories/repository.types.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";

const round = (value: number) => Math.round(value * 100) / 100;
const configuredOpening = (account: any) =>
  Number(account.openingBalance || 0) *
  (String(account.normalBalance || "DEBIT").toUpperCase() === "CREDIT" ? -1 : 1);
const balancePresentation = (value: number) => ({
  currentBalance: round(value),
  balanceAmount: Math.abs(round(value)),
  balanceSide: value > 0 ? "DEBIT" : value < 0 ? "CREDIT" : "ZERO",
});

const shapeCashbox = (row: any) => ({
  id: row.id,
  accountId: row.accountId,
  name: row.name,
  status: row.active ? "active" : "inactive",
  notes: row.notes,
  accountCode: row.account.code,
  accountNameEn: row.account.name,
  accountNameAr: row.account.nameAr || row.account.name,
  openingBalance: Number(row.account.openingBalance || 0),
  ...balancePresentation(configuredOpening(row.account) + Number(row.activityDebit || 0) - Number(row.activityCredit || 0)),
  transactionCount: Number(row.transactionCount || 0),
  masterRecord: row.masterRecord !== false,
});

const shapeBank = (row: any) => ({
  id: row.id,
  accountId: row.accountId,
  bankName: row.bankName,
  iban: row.iban,
  accountNumber: row.accountNumber,
  status: row.active ? "active" : "inactive",
  notes: row.notes,
  accountCode: row.account.code,
  accountNameEn: row.account.name,
  accountNameAr: row.account.nameAr || row.account.name,
  openingBalance: Number(row.account.openingBalance || 0),
  ...balancePresentation(configuredOpening(row.account) + Number(row.activityDebit || 0) - Number(row.activityCredit || 0)),
  transactionCount: Number(row.transactionCount || 0),
  masterRecord: row.masterRecord !== false,
});

export class CashBankService {
  constructor(private readonly prisma: PrismaClient) {}

  async cashboxes() {
    const repository = new CashBankRepository(this.prisma);
    const [registered, accounts] = await Promise.all([
      repository.cashboxes(),
      repository.cashAccounts(),
    ]);
    return this.projectAccounts(registered, accounts, "cashbox", repository).then(
      (rows) => rows.map(shapeCashbox),
    );
  }

  async banks() {
    const repository = new CashBankRepository(this.prisma);
    const [registeredBanks, bankAccounts] = await Promise.all([
      repository.banks(),
      repository.bankAccounts(),
    ]);
    return (await this.projectAccounts(registeredBanks, bankAccounts, "bank", repository)).map(shapeBank);
  }

  async createCashbox(input: any) {
    const name = String(input.name || "").trim();
    if (!name) throw new ServiceError("Cashbox name is required.", 400);
    return this.prisma.$transaction(async (tx) => {
      const account = await this.resolvePaymentAccount(tx, input, "isCashAccount");
      const row = await new CashBankRepository(tx).createCashbox({
        accountId: account.id,
        name,
        active: input.status !== "inactive",
        notes: input.notes,
      });
      return shapeCashbox({ ...row, activityDebit: 0, activityCredit: 0, transactionCount: 0 });
    });
  }

  async createBank(input: any) {
    const bankName = String(input.bankName || "").trim();
    if (!bankName) throw new ServiceError("Bank name is required.", 400);
    return this.prisma.$transaction(async (tx) => {
      const account = await this.resolvePaymentAccount(tx, input, "isBankAccount");
      const row = await new CashBankRepository(tx).createBank({
        accountId: account.id,
        bankName,
        iban: input.iban || undefined,
        accountNumber: input.accountNumber || undefined,
        active: input.status !== "inactive",
        notes: input.notes,
      });
      return shapeBank({ ...row, activityDebit: 0, activityCredit: 0, transactionCount: 0 });
    });
  }

  updateCashbox(id: string, input: any) {
    return new CashBankRepository(this.prisma)
      .updateCashbox(id, {
        name: input.name,
        active: input.status ? input.status === "active" : undefined,
        notes: input.notes,
      })
      .then((row) =>
        shapeCashbox({ ...row, activityDebit: 0, activityCredit: 0, transactionCount: 0 }),
      );
  }

  updateBank(id: string, input: any) {
    return new CashBankRepository(this.prisma)
      .updateBank(id, {
        bankName: input.bankName,
        iban: input.iban,
        accountNumber: input.accountNumber,
        active: input.status ? input.status === "active" : undefined,
        notes: input.notes,
      })
      .then((row) =>
        shapeBank({ ...row, activityDebit: 0, activityCredit: 0, transactionCount: 0 }),
      );
  }

  async transfer(input: any, actor: Actor) {
    const fromAccountId = String(input.fromAccountId || "");
    const toAccountId = String(input.toAccountId || "");
    const amount = Number(input.amount || 0);
    if (!fromAccountId || !toAccountId)
      throw new ServiceError("Both transfer accounts are required.", 400);
    if (fromAccountId === toAccountId)
      throw new ServiceError("Transfer accounts must be different.", 422);
    if (amount <= 0)
      throw new ServiceError("Transfer amount must be greater than zero.", 422);
    const transferNumber =
      input.transferNumber || `TRF-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const transferDate = input.transferDate || input.date || new Date();
    const notes = input.notes ?? input.description;
    return this.prisma.$transaction(async (tx) => {
      const accounts = await tx.chartOfAccount.findMany({
        where: {
          id: { in: [fromAccountId, toAccountId] },
          active: true,
          deletedAt: null,
          OR: [{ isCashAccount: true }, { isBankAccount: true }],
        },
      });
      if (accounts.length !== 2)
        throw new ServiceError(
          "Transfer accounts must be active cash or bank accounts.",
          422,
        );
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: transferDate,
          description: notes || `Transfer ${transferNumber}`,
          referenceNumber: transferNumber,
          sourceType: "cash_bank_transfer",
          sourceId: input.idempotencyKey || transferNumber,
          lines: [
            { accountId: toAccountId, debit: amount },
            { accountId: fromAccountId, credit: amount },
          ],
        },
        actor,
      );
      return new CashBankRepository(tx).createTransfer({
        transferNumber,
        fromAccountId,
        toAccountId,
        amount,
        transferDate: new Date(transferDate),
        journalEntryId: journal.id,
        notes,
      });
    });
  }

  private async projectAccounts(
    registered: any[],
    accounts: any[],
    kind: "cashbox" | "bank",
    repository: CashBankRepository,
  ) {
    const registeredAccountIds = new Set(registered.map((row) => row.accountId));
    const projected = accounts
      .filter((account) => !registeredAccountIds.has(account.id))
      .map((account) => kind === "cashbox" ? {
        id: account.id,
        accountId: account.id,
        name: account.nameAr || account.name,
        active: account.active,
        notes: account.notes,
        account,
      } : {
        id: account.id,
        accountId: account.id,
        bankName: account.nameAr || account.name,
        iban: null,
        accountNumber: null,
        active: account.active,
        notes: account.notes,
        account,
      });
    const rows = [
      ...registered.map((row) => ({ ...row, masterRecord: true })),
      ...projected.map((row) => ({ ...row, masterRecord: false })),
    ];
    const balances = await repository.accountBalances(rows.map((row) => row.accountId));
    const balanceMap = new Map(balances.map((row: any) => [row.accountId, row]));
    return rows.map((row) => {
      const activity: any = balanceMap.get(row.accountId);
      return {
        ...row,
        activityDebit: Number(activity?._sum?.debit || 0),
        activityCredit: Number(activity?._sum?.credit || 0),
        transactionCount: Number(activity?._count?.journalEntryId || 0),
      };
    });
  }

  private async resolvePaymentAccount(
    tx: DatabaseClient,
    input: any,
    flag: "isCashAccount" | "isBankAccount",
  ) {
    const accountId = String(input.accountId || "");
    if (!accountId)
      throw new ServiceError("An accounting account must be selected.", 422, "ACCOUNT_MAPPING_REQUIRED");
    const account = await tx.chartOfAccount.findFirst({
      where: { id: accountId, active: true, deletedAt: null, allowPosting: true, [flag]: true },
    });
    if (!account)
      throw new ServiceError("The selected cash or bank account is invalid.", 422, "INVALID_ACCOUNT_MAPPING");
    const [cashbox, bank] = await new CashBankRepository(tx).findLiveMapping(accountId);
    if (cashbox || bank)
      throw new ServiceError("This accounting account is already linked.", 409, "DUPLICATE_ACCOUNT_MAPPING");
    return account;
  }
}

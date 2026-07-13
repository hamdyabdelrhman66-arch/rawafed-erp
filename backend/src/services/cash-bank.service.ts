import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { CashBankRepository } from "../repositories/cash-bank.repository.js";
import type { DatabaseClient } from "../repositories/repository.types.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";

const balance = (account: any) => {
  const activity = (account.journalLines || []).reduce(
    (sum: number, line: any) =>
      sum + Number(line.debit || 0) - Number(line.credit || 0),
    0,
  );
  return Number(account.openingBalance || 0) + activity;
};

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
  currentBalance: balance(row.account),
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
  currentBalance: balance(row.account),
});

export class CashBankService {
  constructor(private readonly prisma: PrismaClient) {}

  async cashboxes() {
    return (await new CashBankRepository(this.prisma).cashboxes()).map(
      shapeCashbox,
    );
  }

  async banks() {
    return (await new CashBankRepository(this.prisma).banks()).map(shapeBank);
  }

  async createCashbox(input: any) {
    const name = String(input.name || "").trim();
    if (!name) throw new ServiceError("Cashbox name is required.", 400);
    return this.prisma.$transaction(async (tx) => {
      const account = await this.resolvePaymentAccount(tx, input, {
        name,
        systemKey: "cash-main",
        flag: "isCashAccount",
        codePrefix: "CB",
      });
      const row = await new CashBankRepository(tx).createCashbox({
        accountId: account.id,
        name,
        active: input.status !== "inactive",
        notes: input.notes,
      });
      return shapeCashbox({ ...row, account: { ...row.account, journalLines: [] } });
    });
  }

  async createBank(input: any) {
    const bankName = String(input.bankName || "").trim();
    if (!bankName) throw new ServiceError("Bank name is required.", 400);
    return this.prisma.$transaction(async (tx) => {
      const account = await this.resolvePaymentAccount(tx, input, {
        name: bankName,
        systemKey: "bank-main",
        flag: "isBankAccount",
        codePrefix: "BK",
      });
      const row = await new CashBankRepository(tx).createBank({
        accountId: account.id,
        bankName,
        iban: input.iban || undefined,
        accountNumber: input.accountNumber || undefined,
        active: input.status !== "inactive",
        notes: input.notes,
      });
      return shapeBank({ ...row, account: { ...row.account, journalLines: [] } });
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
        shapeCashbox({ ...row, account: { ...row.account, journalLines: [] } }),
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
        shapeBank({ ...row, account: { ...row.account, journalLines: [] } }),
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

  private async resolvePaymentAccount(
    tx: DatabaseClient,
    input: any,
    config: {
      name: string;
      systemKey: string;
      flag: "isCashAccount" | "isBankAccount";
      codePrefix: string;
    },
  ) {
    if (input.accountId) {
      const account = await tx.chartOfAccount.findFirst({
        where: {
          id: input.accountId,
          active: true,
          deletedAt: null,
          [config.flag]: true,
        },
      });
      if (!account)
        throw new ServiceError("Cash or bank account not found.", 422);
      return account;
    }
    const parent = await tx.chartOfAccount.findUnique({
      where: { systemKey: config.systemKey },
    });
    if (!parent)
      throw new ServiceError("Cash or bank control account is not configured.", 422);
    return tx.chartOfAccount.create({
      data: {
        code: `${config.codePrefix}-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: config.name,
        nameAr: config.name,
        type: "ASSET",
        parentId: parent.id,
        openingBalance: Number(input.openingBalance || 0),
        active: input.status !== "inactive",
        allowPosting: true,
        normalBalance: "DEBIT",
        [config.flag]: true,
      },
    });
  }
}

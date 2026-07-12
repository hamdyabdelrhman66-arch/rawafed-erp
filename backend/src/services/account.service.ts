import type { AccountType, PrismaClient } from "@prisma/client";
import {
  AccountsRepository,
  CostCentersRepository,
} from "../repositories/accounts.repository.js";
import { ServiceError } from "./service.error.js";

const shape = (a: any) => ({
  id: a.id,
  code: a.code,
  nameAr: a.nameAr || a.name,
  nameEn: a.name,
  accountType: a.type.toLowerCase(),
  parentId: a.parentId,
  openingBalance: Number(a.openingBalance),
  openingDate: a.openingDate?.toISOString().slice(0, 10),
  currency: a.currency,
  costCenterId: a.costCenterId,
  status: a.active ? "active" : "inactive",
  notes: a.notes,
  normalBalance: String(a.normalBalance || "DEBIT").toLowerCase(),
  postingAccount: a.allowPosting,
  allowManualJournal: a.allowManualJournal,
  system: a.system,
  systemKey: a.systemKey,
  isCashAccount: a.isCashAccount,
  isBankAccount: a.isBankAccount,
  isVatAccount: a.isVatAccount,
  isReceivableAccount: a.isReceivableAccount,
  isPayableAccount: a.isPayableAccount,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});
export class AccountService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(types?: AccountType[]) {
    const repo = new AccountsRepository(this.prisma);
    const accounts = await repo.list(
      types ? { type: { in: types }, active: true } : {},
    );
    const balances = await this.prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { journalEntry: { status: "POSTED", deletedAt: null } },
      _sum: { debit: true, credit: true },
      _count: { journalEntryId: true },
    });
    const map = new Map(balances.map((row) => [row.accountId, row]));
    return accounts.map((account) => {
      const activity = map.get(account.id);
      return {
        ...shape(account),
        debit: Number(activity?._sum.debit || 0),
        credit: Number(activity?._sum.credit || 0),
        currentBalance:
          Number(activity?._sum.debit || 0) -
          Number(activity?._sum.credit || 0),
        journalEntries: activity?._count.journalEntryId || 0,
        hasTransactions: Boolean(activity?._count.journalEntryId),
        canDelete: !account.system && !activity?._count.journalEntryId,
      };
    });
  }
  async costCenters() {
    return new CostCentersRepository(this.prisma).list();
  }
  async create(input: any) {
    const row = await new AccountsRepository(this.prisma).create({
      code: input.code,
      name: input.nameEn,
      nameAr: input.nameAr,
      type: String(input.accountType).toUpperCase(),
      parentId: input.parentId || null,
      openingBalance: Number(input.openingBalance || 0),
      openingDate: input.openingDate ? new Date(input.openingDate) : null,
      currency: input.currency || "SAR",
      costCenterId: input.costCenterId || null,
      notes: input.notes,
      normalBalance: String(
        input.normalBalance ||
          (["asset", "expense"].includes(input.accountType)
            ? "debit"
            : "credit"),
      ).toUpperCase(),
      allowPosting: input.postingAccount !== false,
      allowManualJournal: input.allowManualJournal !== false,
      active: input.status !== "inactive",
    } as any);
    return shape(row);
  }
  async update(id: string, input: any) {
    const repo = new AccountsRepository(this.prisma);
    const current = await repo.find(id);
    if (!current)
      throw new ServiceError("Account not found.", 404, "NOT_FOUND");
    const hasLines = Boolean(await repo.lines(id));
    if (
      hasLines &&
      input.accountType &&
      String(input.accountType).toUpperCase() !== current.type
    )
      throw new ServiceError(
        "Account type cannot change after posting activity.",
        422,
      );
    if (
      current.system &&
      input.accountType &&
      String(input.accountType).toUpperCase() !== current.type
    )
      throw new ServiceError("System accounts cannot be reclassified.", 422);
    if (input.parentId !== undefined)
      await this.assertValidParent(id, input.parentId || null, current.type);
    return shape(
      await repo.update(id, {
        name: input.nameEn,
        nameAr: input.nameAr,
        parentId: input.parentId,
        costCenterId: input.costCenterId,
        notes: input.notes,
        allowPosting: input.postingAccount,
        allowManualJournal: input.allowManualJournal,
        active: input.status ? input.status === "active" : undefined,
      }),
    );
  }
  async archive(id: string) {
    const repo = new AccountsRepository(this.prisma);
    const account = await repo.find(id);
    if (!account)
      throw new ServiceError("Account not found.", 404, "NOT_FOUND");
    if (account.system)
      throw new ServiceError("System accounts cannot be archived.", 422);
    if (await repo.children(id))
      throw new ServiceError(
        "Account has child accounts and cannot be archived.",
        422,
      );
    return shape(await repo.update(id, { active: false }));
  }
  async move(id: string, parentId: string | null) {
    const repo = new AccountsRepository(this.prisma);
    const account = await repo.find(id);
    if (!account)
      throw new ServiceError("Account not found.", 404, "NOT_FOUND");
    await this.assertValidParent(id, parentId, account.type);
    return shape(await repo.update(id, { parentId }));
  }
  private async assertValidParent(
    id: string,
    parentId: string | null,
    type: AccountType,
  ) {
    if (!parentId) return;
    if (id === parentId)
      throw new ServiceError("Account cannot be its own parent.", 422);
    const repo = new AccountsRepository(this.prisma);
    let parent = await repo.find(parentId);
    if (!parent) throw new ServiceError("Parent account not found.", 422);
    if (parent.type !== type)
      throw new ServiceError("Parent and child account types must match.", 422);
    const visited = new Set<string>();
    while (parent?.parentId) {
      if (parent.parentId === id)
        throw new ServiceError(
          "Circular account hierarchy is not allowed.",
          422,
        );
      if (visited.has(parent.parentId))
        throw new ServiceError("Invalid account hierarchy detected.", 422);
      visited.add(parent.parentId);
      parent = await repo.find(parent.parentId);
    }
  }
  async suggest(parentId = "", type = "asset") {
    const repo = new AccountsRepository(this.prisma);
    const parent = parentId ? await repo.find(parentId) : null;
    const prefix =
      parent?.code ||
      (
        {
          asset: "1",
          liability: "2",
          equity: "3",
          revenue: "4",
          expense: "5",
        } as any
      )[type] ||
      "9";
    const latest = await repo.nextCode(prefix);
    return { code: String(Number(latest?.code || `${prefix}000`) + 1) };
  }
}

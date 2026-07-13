import type { AccountType, PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
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
  async details(id: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, deletedAt: null },
      include: { parent: true, costCenter: true },
    });
    if (!account)
      throw new ServiceError("Account not found.", 404, "NOT_FOUND");
    const [lines, audits, linkedInvoices, linkedPayments, linkedAssets] =
      await Promise.all([
        this.prisma.journalLine.findMany({
          where: {
            accountId: id,
            journalEntry: { status: "POSTED", deletedAt: null },
          },
          include: {
            journalEntry: {
              include: { branch: true, createdBy: true },
            },
            costCenter: true,
          },
          orderBy: [
            { journalEntry: { postingDate: "asc" } },
            { createdAt: "asc" },
          ],
        }),
        this.prisma.auditLog.findMany({
          where: { entityType: "account", entityId: id },
          include: { actor: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        this.prisma.invoiceLine.count({ where: { revenueAccountId: id } }),
        this.prisma.journalEntry.count({
          where: {
            paymentId: { not: null },
            lines: { some: { accountId: id } },
            deletedAt: null,
          },
        }),
        this.prisma.fixedAsset.count({
          where: {
            deletedAt: null,
            category: {
              OR: [
                { assetAccountId: id },
                { accumulatedDepreciationAccountId: id },
                { depreciationExpenseAccountId: id },
              ],
            },
          },
        }),
      ]);
    const opening = Number(account.openingBalance);
    const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    const creditNormal = account.normalBalance === "CREDIT";
    let running = opening;
    const transactions = lines.map((line) => {
      running += creditNormal
        ? Number(line.credit) - Number(line.debit)
        : Number(line.debit) - Number(line.credit);
      return {
        id: line.id,
        journalId: line.journalEntryId,
        entryNumber: line.journalEntry.entryNumber,
        date: line.journalEntry.postingDate.toISOString().slice(0, 10),
        description: line.description || line.journalEntry.description,
        referenceNumber: line.journalEntry.referenceNumber,
        debit: Number(line.debit),
        credit: Number(line.credit),
        runningBalance: Math.round(running * 100) / 100,
        branch: line.journalEntry.branch.name,
        costCenter: line.costCenter?.nameEn,
        createdBy: line.journalEntry.createdBy?.displayName,
      };
    });
    const movement = (unit: "month" | "quarter" | "year") => {
      const result = new Map<string, { period: string; debit: number; credit: number }>();
      for (const line of lines) {
        const date = line.journalEntry.postingDate;
        const year = date.getUTCFullYear();
        const period =
          unit === "year"
            ? String(year)
            : unit === "quarter"
              ? `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
              : `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
        const row = result.get(period) || { period, debit: 0, credit: 0 };
        row.debit += Number(line.debit);
        row.credit += Number(line.credit);
        result.set(period, row);
      }
      return [...result.values()].map((row) => ({
        ...row,
        debit: Math.round(row.debit * 100) / 100,
        credit: Math.round(row.credit * 100) / 100,
        net: Math.round((row.debit - row.credit) * 100) / 100,
      }));
    };
    const branches = new Set(
      lines.map((line) => line.journalEntry.branch.name).filter(Boolean),
    );
    const costCenters = new Set(
      lines.map((line) => line.costCenter?.nameEn).filter(Boolean),
    );
    if (account.costCenter?.nameEn) costCenters.add(account.costCenter.nameEn);
    return {
      ...shape(account),
      parentAccount: account.parent
        ? { id: account.parent.id, code: account.parent.code, name: account.parent.name }
        : null,
      branch: branches.size === 1 ? [...branches][0] : branches.size ? "Multiple" : null,
      costCenter: account.costCenter?.nameEn,
      debitTotal: debit,
      creditTotal: credit,
      currentBalance: Math.round(running * 100) / 100,
      transactionCount: lines.length,
      journalCount: new Set(lines.map((line) => line.journalEntryId)).size,
      firstTransactionDate: transactions[0]?.date,
      lastTransactionDate: transactions.at(-1)?.date,
      createdBy: audits.find((item) => item.action.includes("create"))?.actor
        ?.displayName,
      lastModifiedBy: audits[0]?.actor?.displayName,
      linkedReports: ["Trial Balance", "Balance Sheet", "Income Statement", "Cash Flow"],
      linkedJournals: new Set(lines.map((line) => line.journalEntryId)).size,
      linkedInvoices,
      linkedPayments,
      linkedAssets,
      linkedCostCenters: costCenters.size,
      linkedBranches: branches.size,
      recentJournalEntries: transactions.slice(-10).reverse(),
      transactions,
      monthlyMovement: movement("month"),
      quarterlyMovement: movement("quarter"),
      yearlyMovement: movement("year"),
      recentActivity: [
        ...audits.slice(0, 10).map((item) => ({
          type: "audit",
          title: item.action,
          date: item.createdAt.toISOString(),
          by: item.actor?.displayName || item.actorRole,
        })),
        ...transactions.slice(-10).map((item) => ({
          type: "journal",
          title: `${item.entryNumber} · ${item.description}`,
          date: item.date,
          amount: item.debit || item.credit,
        })),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date))),
      auditLog: audits.map((item) => ({
        id: item.id,
        action: item.action,
        actor: item.actor?.displayName || item.actorRole,
        details: item.details,
        date: item.createdAt.toISOString(),
      })),
    };
  }
  async costCenters() {
    return new CostCentersRepository(this.prisma).list();
  }
  async expenseAccounts() {
    return this.list(["EXPENSE"]);
  }
  async revenueAccounts() {
    return this.list(["REVENUE"]);
  }
  async paymentAccounts() {
    return (await this.list(["ASSET"])).filter(
      (account) => account.isCashAccount || account.isBankAccount,
    );
  }
  async receivableAccounts() {
    return (await this.list(["ASSET"])).filter(
      (account) => account.isReceivableAccount,
    );
  }
  async payableAccounts() {
    return (await this.list(["LIABILITY"])).filter(
      (account) => account.isPayableAccount,
    );
  }
  async create(input: any, actor: Actor = {}) {
    const type = String(input.accountType).toUpperCase() as AccountType;
    await this.assertValidParent("__new_account__", input.parentId || null, type);
    return this.prisma.$transaction(async (tx) => {
      const row = await new AccountsRepository(tx).create({
        code: input.code,
        name: input.nameEn,
        nameAr: input.nameAr,
        type,
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
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create account",
        entityType: "account",
        entityId: row.id,
      });
      return shape(row);
    });
  }
  async update(id: string, input: any, actor: Actor = {}) {
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
    return this.prisma.$transaction(async (tx) => {
      const row = await new AccountsRepository(tx).update(id, {
        name: input.nameEn,
        nameAr: input.nameAr,
        parentId: input.parentId,
        costCenterId: input.costCenterId,
        notes: input.notes,
        allowPosting: input.postingAccount,
        allowManualJournal: input.allowManualJournal,
        active: input.status ? input.status === "active" : undefined,
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "update account",
        entityType: "account",
        entityId: id,
      });
      return shape(row);
    });
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

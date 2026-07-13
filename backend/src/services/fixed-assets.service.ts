import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import type { DatabaseClient } from "../repositories/repository.types.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";

const money = (value: unknown) =>
  Math.round((Number(value) || 0) * 100) / 100;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const isoDate = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10) : undefined;

const assetShape = (asset: any) => ({
  id: asset.id,
  assetCode: asset.assetCode,
  nameAr: asset.nameAr,
  nameEn: asset.nameEn,
  categoryId: asset.categoryId,
  categoryCode: asset.category?.code,
  categoryNameAr: asset.category?.nameAr,
  categoryNameEn: asset.category?.nameEn,
  branchId: asset.branchId,
  branchCode: asset.branch?.code,
  branchName: asset.branch?.name,
  costCenterId: asset.costCenterId,
  costCenterCode: asset.costCenter?.code,
  costCenterName: asset.costCenter?.nameEn,
  supplierId: asset.supplierId,
  supplierCode: asset.supplier?.supplierCode,
  supplierName: asset.supplier?.nameEn,
  purchaseDate: isoDate(asset.purchaseDate),
  purchaseInvoice: asset.purchaseInvoice,
  purchaseCost: money(asset.purchaseCost),
  residualValue: money(asset.residualValue),
  usefulLifeMonths: asset.usefulLifeMonths,
  depreciationMethod: asset.depreciationMethod,
  decliningRate: Number(asset.decliningRate || 0),
  currentBookValue: money(asset.currentBookValue),
  accumulatedDepreciation: money(
    Number(asset.purchaseCost) - Number(asset.currentBookValue),
  ),
  status: asset.status,
  custodian: asset.custodian,
  location: asset.location,
  barcode: asset.barcode,
  warrantyEndsAt: isoDate(asset.warrantyEndsAt),
  warrantyStatus: asset.warrantyEndsAt
    ? asset.warrantyEndsAt >= new Date()
      ? "ACTIVE"
      : "EXPIRED"
    : "NONE",
  notes: asset.notes,
  attachments: Array.isArray(asset.attachments) ? asset.attachments : [],
  acquisitionJournalId: asset.acquisitionJournalId,
  depreciationEntries: (asset.depreciationEntries || []).map((entry: any) => ({
    ...entry,
    amount: money(entry.amount),
    accumulatedAmount: money(entry.accumulatedAmount),
    bookValueAfter: money(entry.bookValueAfter),
    period: isoDate(entry.period),
  })),
  transfers: (asset.transfers || []).map((transfer: any) => ({
    ...transfer,
    transferDate: isoDate(transfer.transferDate),
    fromBranchName: transfer.fromBranch?.name,
    toBranchName: transfer.toBranch?.name,
  })),
  disposals: (asset.disposals || []).map((disposal: any) => ({
    ...disposal,
    disposalDate: isoDate(disposal.disposalDate),
    proceeds: money(disposal.proceeds),
    bookValue: money(disposal.bookValue),
    gainLoss: money(disposal.gainLoss),
  })),
  maintenance: (asset.maintenance || []).map((item: any) => ({
    ...item,
    maintenanceDate: isoDate(item.maintenanceDate),
    nextDueDate: isoDate(item.nextDueDate),
    cost: money(item.cost),
  })),
  createdAt: asset.createdAt?.toISOString(),
  updatedAt: asset.updatedAt?.toISOString(),
});

const assetInclude = {
  category: true,
  branch: true,
  costCenter: true,
  supplier: true,
  depreciationEntries: { orderBy: { period: "desc" as const } },
  transfers: {
    include: { fromBranch: true, toBranch: true },
    orderBy: { transferDate: "desc" as const },
  },
  disposals: { orderBy: { disposalDate: "desc" as const } },
  maintenance: { orderBy: { maintenanceDate: "desc" as const } },
};

export class FixedAssetsService {
  constructor(private readonly prisma: PrismaClient) {}

  async masterData() {
    const [branches, costCenters, suppliers, accounts] = await Promise.all([
      this.prisma.branch.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { code: "asc" },
      }),
      this.prisma.costCenter.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { code: "asc" },
      }),
      this.prisma.accountingSupplier.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { supplierCode: "asc" },
      }),
      this.prisma.chartOfAccount.findMany({
        where: { active: true, deletedAt: null, allowPosting: true },
        orderBy: { code: "asc" },
      }),
    ]);
    return {
      branches,
      costCenters,
      suppliers,
      accounts: accounts.map((account) => ({
        id: account.id,
        code: account.code,
        nameEn: account.name,
        nameAr: account.nameAr,
        type: account.type.toLowerCase(),
        isPaymentAccount: account.isCashAccount || account.isBankAccount,
      })),
    };
  }

  async categories() {
    return (
      await this.prisma.fixedAssetCategory.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
      })
    ).map((category) => ({
      ...category,
      decliningRate: Number(category.decliningRate || 0),
    }));
  }

  async createCategory(input: any, actor: Actor) {
    const code = String(input.code || "").trim().toUpperCase();
    const nameEn = String(input.nameEn || "").trim();
    const nameAr = String(input.nameAr || input.nameEn || "").trim();
    const usefulLifeMonths = Number(input.usefulLifeMonths || 60);
    const method = this.method(input.depreciationMethod);
    if (!code || !nameEn || !nameAr || usefulLifeMonths <= 0)
      throw new ServiceError("Category code, names, and useful life are required.", 400);
    return this.prisma.$transaction(async (tx) => {
      const defaults = await this.ensureAccounts(tx);
      const category = await tx.fixedAssetCategory.create({
        data: {
          code,
          nameEn,
          nameAr,
          usefulLifeMonths,
          depreciationMethod: method,
          decliningRate:
            method === "DECLINING_BALANCE"
              ? Number(input.decliningRate || 40)
              : null,
          assetAccountId: input.assetAccountId || defaults.asset.id,
          accumulatedDepreciationAccountId:
            input.accumulatedDepreciationAccountId || defaults.accumulated.id,
          depreciationExpenseAccountId:
            input.depreciationExpenseAccountId || defaults.expense.id,
          active: input.status !== "inactive",
          notes: input.notes,
        },
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create fixed asset category",
        entityType: "fixed_asset_category",
        entityId: category.id,
      });
      return category;
    });
  }

  async list() {
    return (
      await this.prisma.fixedAsset.findMany({
        where: { deletedAt: null },
        include: assetInclude,
        orderBy: { assetCode: "asc" },
      })
    ).map(assetShape);
  }

  async get(id: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id, deletedAt: null },
      include: assetInclude,
    });
    if (!asset) throw new ServiceError("Fixed asset not found.", 404);
    return assetShape(asset);
  }

  async create(input: any, actor: Actor) {
    const purchaseCost = money(input.purchaseCost);
    const residualValue = money(input.residualValue);
    const usefulLifeMonths = Number(input.usefulLifeMonths || 0);
    if (
      !input.categoryId ||
      !input.branchId ||
      !String(input.nameEn || "").trim() ||
      purchaseCost <= 0 ||
      residualValue < 0 ||
      residualValue >= purchaseCost ||
      usefulLifeMonths <= 0
    )
      throw new ServiceError(
        "Asset category, branch, name, cost, residual value, and useful life are invalid.",
        422,
      );
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.fixedAssetCategory.findFirst({
        where: { id: input.categoryId, active: true, deletedAt: null },
      });
      if (!category) throw new ServiceError("Asset category not found.", 404);
      const branch = await tx.branch.findFirst({
        where: { id: input.branchId, active: true, deletedAt: null },
      });
      if (!branch) throw new ServiceError("Branch not found.", 404);
      const creditAccountId = await this.acquisitionCreditAccount(tx, input);
      const asset = await tx.fixedAsset.create({
        data: {
          assetCode:
            String(input.assetCode || "").trim().toUpperCase() ||
            `FA-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
          nameAr: String(input.nameAr || input.nameEn).trim(),
          nameEn: String(input.nameEn).trim(),
          categoryId: category.id,
          branchId: branch.id,
          costCenterId: input.costCenterId || null,
          supplierId: input.supplierId || null,
          purchaseDate: new Date(input.purchaseDate || Date.now()),
          purchaseInvoice: input.purchaseInvoice || null,
          purchaseCost,
          residualValue,
          usefulLifeMonths,
          depreciationMethod: this.method(
            input.depreciationMethod || category.depreciationMethod,
          ),
          decliningRate: Number(
            input.decliningRate || category.decliningRate || 40,
          ),
          currentBookValue: purchaseCost,
          status: "ACTIVE",
          custodian: input.custodian || null,
          location: input.location || null,
          barcode:
            input.barcode || `FA-${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          warrantyEndsAt: input.warrantyEndsAt
            ? new Date(input.warrantyEndsAt)
            : null,
          notes: input.notes || null,
          attachments: json(input.attachments || []),
        },
      });
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: asset.purchaseDate,
          description: `Fixed asset acquisition ${asset.assetCode}`,
          referenceNumber: asset.purchaseInvoice || asset.assetCode,
          sourceType: "fixed_asset_acquisition",
          sourceId: asset.id,
          lines: [
            {
              accountId: category.assetAccountId,
              debit: purchaseCost,
              costCenterId: asset.costCenterId || undefined,
            },
            { accountId: creditAccountId, credit: purchaseCost },
          ],
        },
        actor,
      );
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { acquisitionJournalId: journal.id },
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "acquire fixed asset",
        entityType: "fixed_asset",
        entityId: asset.id,
        details: { assetCode: asset.assetCode, purchaseCost },
      });
      return this.getUsing(tx, asset.id);
    });
  }

  async depreciate(id: string, input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findFirst({
        where: { id, deletedAt: null, status: "ACTIVE" },
        include: { category: true, depreciationEntries: true },
      });
      if (!asset) throw new ServiceError("Active fixed asset not found.", 404);
      const period = new Date(input.period || Date.now());
      period.setUTCDate(1);
      const depreciableRemaining = money(
        Number(asset.currentBookValue) - Number(asset.residualValue),
      );
      if (depreciableRemaining <= 0)
        throw new ServiceError("Asset has reached its residual value.", 422);
      const amount = Math.min(
        depreciableRemaining,
        this.depreciationAmount(asset),
      );
      if (amount <= 0)
        throw new ServiceError("Calculated depreciation is zero.", 422);
      const accumulated = money(
        Number(asset.purchaseCost) - Number(asset.currentBookValue) + amount,
      );
      const bookValueAfter = money(Number(asset.currentBookValue) - amount);
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: period,
          description: `Monthly depreciation ${asset.assetCode}`,
          referenceNumber: `${asset.assetCode}-${period.toISOString().slice(0, 7)}`,
          sourceType: "fixed_asset_depreciation",
          sourceId: `${asset.id}:${period.toISOString().slice(0, 7)}`,
          lines: [
            {
              accountId: asset.category.depreciationExpenseAccountId,
              debit: amount,
              costCenterId: asset.costCenterId || undefined,
            },
            {
              accountId: asset.category.accumulatedDepreciationAccountId,
              credit: amount,
              costCenterId: asset.costCenterId || undefined,
            },
          ],
        },
        actor,
      );
      await tx.fixedAssetDepreciation.create({
        data: {
          assetId: asset.id,
          period,
          amount,
          accumulatedAmount: accumulated,
          bookValueAfter,
          journalEntryId: journal.id,
        },
      });
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { currentBookValue: bookValueAfter },
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "post fixed asset depreciation",
        entityType: "fixed_asset",
        entityId: asset.id,
        details: { period: isoDate(period), amount, bookValueAfter },
      });
      return this.getUsing(tx, asset.id);
    });
  }

  async runDepreciation(input: any, actor: Actor) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    const results: any[] = [];
    for (const asset of assets) {
      try {
        results.push(await this.depreciate(asset.id, input, actor));
      } catch (error: any) {
        if (error?.code !== "P2002") results.push({ id: asset.id, error: error.message });
      }
    }
    return { processed: results.filter((item) => !item.error).length, results };
  }

  async transfer(id: string, input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findFirst({
        where: { id, deletedAt: null, status: "ACTIVE" },
      });
      if (!asset) throw new ServiceError("Active fixed asset not found.", 404);
      if (!input.toBranchId)
        throw new ServiceError("Destination branch is required.", 400);
      const transfer = await tx.fixedAssetTransfer.create({
        data: {
          assetId: asset.id,
          transferDate: new Date(input.transferDate || Date.now()),
          fromBranchId: asset.branchId,
          toBranchId: input.toBranchId,
          fromLocation: asset.location,
          toLocation: input.toLocation || asset.location,
          fromCustodian: asset.custodian,
          toCustodian: input.toCustodian || asset.custodian,
          notes: input.notes,
        },
      });
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          branchId: input.toBranchId,
          location: input.toLocation || asset.location,
          custodian: input.toCustodian || asset.custodian,
        },
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "transfer fixed asset",
        entityType: "fixed_asset",
        entityId: asset.id,
        details: { transferId: transfer.id, toBranchId: input.toBranchId },
      });
      return this.getUsing(tx, asset.id);
    });
  }

  async dispose(id: string, input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findFirst({
        where: { id, deletedAt: null, status: "ACTIVE" },
        include: { category: true },
      });
      if (!asset) throw new ServiceError("Active fixed asset not found.", 404);
      const defaults = await this.ensureAccounts(tx);
      const disposalType = String(input.disposalType || "DISPOSAL").toUpperCase();
      const proceeds = disposalType === "SALE" ? money(input.proceeds) : 0;
      const bookValue = money(asset.currentBookValue);
      const gainLoss = money(proceeds - bookValue);
      const accumulated = money(Number(asset.purchaseCost) - bookValue);
      const lines: any[] = [];
      if (accumulated > 0)
        lines.push({
          accountId: asset.category.accumulatedDepreciationAccountId,
          debit: accumulated,
        });
      if (proceeds > 0) {
        const paymentAccount = await tx.chartOfAccount.findFirst({
          where: {
            id: input.paymentAccountId,
            active: true,
            deletedAt: null,
            OR: [{ isCashAccount: true }, { isBankAccount: true }],
          },
        });
        if (!paymentAccount)
          throw new ServiceError("Sale payment account is required.", 422);
        lines.push({ accountId: paymentAccount.id, debit: proceeds });
      }
      if (gainLoss < 0)
        lines.push({ accountId: defaults.loss.id, debit: Math.abs(gainLoss) });
      lines.push({
        accountId: asset.category.assetAccountId,
        credit: Number(asset.purchaseCost),
      });
      if (gainLoss > 0)
        lines.push({ accountId: defaults.gain.id, credit: gainLoss });
      const disposalDate = new Date(input.disposalDate || Date.now());
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: disposalDate,
          description: `${disposalType} fixed asset ${asset.assetCode}`,
          referenceNumber: asset.assetCode,
          sourceType: `fixed_asset_${disposalType.toLowerCase()}`,
          sourceId: asset.id,
          lines,
        },
        actor,
      );
      await tx.fixedAssetDisposal.create({
        data: {
          assetId: asset.id,
          disposalDate,
          disposalType,
          proceeds,
          bookValue,
          gainLoss,
          reason: input.reason,
          buyer: input.buyer,
          journalEntryId: journal.id,
          notes: input.notes,
        },
      });
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          currentBookValue: 0,
          status:
            disposalType === "SALE"
              ? "SOLD"
              : disposalType === "WRITE_OFF"
                ? "WRITTEN_OFF"
                : "DISPOSED",
        },
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: `${disposalType.toLowerCase()} fixed asset`,
        entityType: "fixed_asset",
        entityId: asset.id,
        details: { proceeds, bookValue, gainLoss },
      });
      return this.getUsing(tx, asset.id);
    });
  }

  async addMaintenance(id: string, input: any, actor: Actor) {
    const description = String(input.description || "").trim();
    if (!description)
      throw new ServiceError("Maintenance description is required.", 400);
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findFirst({
        where: { id, deletedAt: null },
      });
      if (!asset) throw new ServiceError("Fixed asset not found.", 404);
      const row = await tx.fixedAssetMaintenance.create({
        data: {
          assetId: asset.id,
          maintenanceDate: new Date(input.maintenanceDate || Date.now()),
          maintenanceType: input.maintenanceType || "PREVENTIVE",
          supplierName: input.supplierName,
          cost: money(input.cost),
          nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : null,
          status: input.status || "COMPLETED",
          description,
          notes: input.notes,
          attachments: json(input.attachments || []),
        },
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "record fixed asset maintenance",
        entityType: "fixed_asset",
        entityId: asset.id,
        details: { maintenanceId: row.id, cost: money(input.cost) },
      });
      return row;
    });
  }

  async reports(type: string) {
    const assets = await this.list();
    if (type === "depreciation-schedule")
      return assets.flatMap((asset: any) => asset.depreciationEntries.map((entry: any) => ({
        assetCode: asset.assetCode,
        assetName: asset.nameEn,
        method: asset.depreciationMethod,
        ...entry,
      })));
    if (type === "asset-value")
      return assets.map((asset: any) => ({
        assetCode: asset.assetCode,
        assetName: asset.nameEn,
        purchaseCost: asset.purchaseCost,
        accumulatedDepreciation: asset.accumulatedDepreciation,
        currentBookValue: asset.currentBookValue,
        residualValue: asset.residualValue,
      }));
    if (type === "asset-movement")
      return assets.flatMap((asset: any) => asset.transfers.map((transfer: any) => ({
        assetCode: asset.assetCode,
        assetName: asset.nameEn,
        ...transfer,
      })));
    if (type === "asset-by-branch")
      return this.group(assets, "branchName");
    if (type === "asset-by-category")
      return this.group(assets, "categoryNameEn");
    return assets;
  }

  private group(assets: any[], key: string) {
    const grouped = new Map<string, any>();
    for (const asset of assets) {
      const label = String(asset[key] || "Unassigned");
      const row = grouped.get(label) || {
        label,
        assetCount: 0,
        purchaseCost: 0,
        accumulatedDepreciation: 0,
        currentBookValue: 0,
      };
      row.assetCount += 1;
      row.purchaseCost = money(row.purchaseCost + asset.purchaseCost);
      row.accumulatedDepreciation = money(
        row.accumulatedDepreciation + asset.accumulatedDepreciation,
      );
      row.currentBookValue = money(row.currentBookValue + asset.currentBookValue);
      grouped.set(label, row);
    }
    return [...grouped.values()];
  }

  private method(value: unknown) {
    return String(value || "STRAIGHT_LINE").toUpperCase() ===
      "DECLINING_BALANCE"
      ? "DECLINING_BALANCE"
      : "STRAIGHT_LINE";
  }

  private depreciationAmount(asset: any) {
    if (asset.depreciationMethod === "DECLINING_BALANCE") {
      const annualRate = Number(asset.decliningRate || 40) / 100;
      return money(Number(asset.currentBookValue) * (annualRate / 12));
    }
    return money(
      (Number(asset.purchaseCost) - Number(asset.residualValue)) /
        Number(asset.usefulLifeMonths),
    );
  }

  private async acquisitionCreditAccount(tx: DatabaseClient, input: any) {
    if (input.paymentAccountId) {
      const payment = await tx.chartOfAccount.findFirst({
        where: {
          id: input.paymentAccountId,
          active: true,
          deletedAt: null,
          OR: [{ isCashAccount: true }, { isBankAccount: true }],
        },
      });
      if (!payment) throw new ServiceError("Payment account not found.", 422);
      return payment.id;
    }
    if (input.supplierId) {
      const supplier = await tx.accountingSupplier.findFirst({
        where: { id: input.supplierId, active: true, deletedAt: null },
      });
      if (!supplier) throw new ServiceError("Supplier not found.", 404);
      return supplier.payableAccountId;
    }
    const payment = await tx.chartOfAccount.findFirst({
      where: {
        active: true,
        deletedAt: null,
        OR: [{ isBankAccount: true }, { isCashAccount: true }],
      },
      orderBy: { code: "asc" },
    });
    if (!payment)
      throw new ServiceError("Cash or bank account is not configured.", 422);
    return payment.id;
  }

  private async ensureAccounts(tx: DatabaseClient) {
    const ensure = async (data: any) => {
      const existing = await tx.chartOfAccount.findFirst({
        where: {
          deletedAt: null,
          OR: [{ systemKey: data.systemKey }, { code: data.code }],
        },
      });
      return existing || tx.chartOfAccount.create({ data });
    };
    const [asset, accumulated, expense, gain, loss] = await Promise.all([
      ensure({ code: "1500", name: "Fixed Assets", nameAr: "الأصول الثابتة", type: "ASSET", system: true, systemKey: "fixed-assets" }),
      ensure({ code: "1590", name: "Accumulated Depreciation", nameAr: "مجمع الإهلاك", type: "ASSET", normalBalance: "CREDIT", system: true, systemKey: "accumulated-depreciation" }),
      ensure({ code: "5300", name: "Depreciation Expense", nameAr: "مصروف الإهلاك", type: "EXPENSE", system: true, systemKey: "depreciation-expense" }),
      ensure({ code: "4200", name: "Gain on Asset Disposal", nameAr: "أرباح استبعاد الأصول", type: "REVENUE", normalBalance: "CREDIT", system: true, systemKey: "asset-disposal-gain" }),
      ensure({ code: "5350", name: "Loss on Asset Disposal", nameAr: "خسائر استبعاد الأصول", type: "EXPENSE", system: true, systemKey: "asset-disposal-loss" }),
    ]);
    return { asset, accumulated, expense, gain, loss };
  }

  private async getUsing(tx: DatabaseClient, id: string) {
    const asset = await tx.fixedAsset.findUnique({
      where: { id },
      include: assetInclude,
    });
    return assetShape(asset);
  }
}

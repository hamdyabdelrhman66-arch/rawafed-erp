import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { FixedAssetsService } from "../src/services/fixed-assets.service.js";

class RollbackFixture extends Error {}

describe("fixed assets subledger", () => {
  it("posts acquisition, depreciation, transfer, and disposal as balanced journals", async () => {
    const observed: any = {};
    await expect(
      prisma.$transaction(async (tx) => {
        const suffix = randomUUID().slice(0, 8);
        const branch =
          (await tx.branch.findFirst({ where: { active: true, deletedAt: null } })) ||
          (await tx.branch.create({ data: { code: `FA-${suffix}`, name: "Assets Test Branch" } }));
        const destination = await tx.branch.create({
          data: { code: `FD-${suffix}`, name: "Assets Destination Branch" },
        });
        const cash =
          (await tx.chartOfAccount.findFirst({
            where: { active: true, deletedAt: null, isCashAccount: true },
          })) ||
          (await tx.chartOfAccount.create({
            data: { code: `FC-${suffix}`, name: "Assets Test Cash", type: "ASSET", isCashAccount: true },
          }));
        const nestedClient = new Proxy(tx as unknown as PrismaClient, {
          get(target, property, receiver) {
            if (property === "$transaction")
              return async (operation: (client: Prisma.TransactionClient) => unknown) => operation(tx);
            return Reflect.get(target, property, receiver);
          },
        });
        const service = new FixedAssetsService(nestedClient);
        const category = await service.createCategory(
          {
            code: `EQUIP-${suffix}`,
            nameEn: "Test Equipment",
            nameAr: "معدات اختبار",
            usefulLifeMonths: 60,
            depreciationMethod: "STRAIGHT_LINE",
          },
          {},
        );
        let asset = await service.create(
          {
            assetCode: `AST-${suffix}`,
            nameEn: "Test Projector",
            nameAr: "جهاز عرض اختبار",
            categoryId: category.id,
            branchId: branch.id,
            purchaseDate: "2026-07-01",
            purchaseCost: 12000,
            residualValue: 2000,
            usefulLifeMonths: 50,
            depreciationMethod: "STRAIGHT_LINE",
            paymentAccountId: cash.id,
          },
          {},
        );
        asset = await service.depreciate(asset.id, { period: "2026-07-01" }, {});
        expect(asset.currentBookValue).toBe(11800);
        asset = await service.transfer(
          asset.id,
          { toBranchId: destination.id, toLocation: "Room B-12" },
          {},
        );
        expect(asset.branchId).toBe(destination.id);
        asset = await service.dispose(
          asset.id,
          { disposalType: "SALE", proceeds: 11000, paymentAccountId: cash.id },
          {},
        );
        expect(asset.status).toBe("SOLD");
        const journals = await tx.journalEntry.findMany({
          where: { sourceType: { startsWith: "fixed_asset_" }, sourceId: { contains: asset.id } },
          include: { lines: true },
        });
        observed.count = journals.length;
        observed.balanced = journals.every(
          (entry) =>
            entry.lines.reduce((sum, line) => sum + Number(line.debit), 0) ===
            entry.lines.reduce((sum, line) => sum + Number(line.credit), 0),
        );
        throw new RollbackFixture();
      }, { timeout: 120_000 }),
    ).rejects.toBeInstanceOf(RollbackFixture);
    expect(observed).toEqual({ count: 3, balanced: true });
  }, 120_000);
});

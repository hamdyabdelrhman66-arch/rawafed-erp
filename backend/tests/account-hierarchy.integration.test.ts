import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { AccountService } from "../src/services/account.service.js";

class RollbackFixture extends Error {}

describe("chart of accounts hierarchy", () => {
  it("preserves valid hierarchy and rejects self, circular, and cross-type moves", async () => {
    const checks: Record<string, boolean> = {};
    await expect(
      prisma.$transaction(async (tx) => {
        const nestedClient = new Proxy(tx as unknown as PrismaClient, {
          get(target, property, receiver) {
            if (property === "$transaction") return async (fn: (client: Prisma.TransactionClient) => unknown) => fn(tx);
            return Reflect.get(target, property, receiver);
          },
        });
        const service = new AccountService(nestedClient);
        const suffix = randomUUID().slice(0, 8);
        const parent = await service.create({ code: `H-${suffix}-1`, nameEn: "Hierarchy Parent", accountType: "asset", postingAccount: false });
        const child = await service.create({ code: `H-${suffix}-2`, nameEn: "Hierarchy Child", accountType: "asset", parentId: parent.id });
        const grandchild = await service.create({ code: `H-${suffix}-3`, nameEn: "Hierarchy Grandchild", accountType: "asset", parentId: child.id });
        const liability = await service.create({ code: `H-${suffix}-4`, nameEn: "Other Type", accountType: "liability" });

        checks.persisted = (await tx.chartOfAccount.findUnique({ where: { id: grandchild.id } }))?.parentId === child.id;
        checks.self = await service.move(child.id, child.id).then(() => false, () => true);
        checks.circular = await service.move(parent.id, grandchild.id).then(() => false, () => true);
        checks.crossType = await service.move(child.id, liability.id).then(() => false, () => true);
        checks.archiveParent = await service.archive(parent.id).then(() => false, () => true);
        throw new RollbackFixture();
      }),
    ).rejects.toBeInstanceOf(RollbackFixture);
    expect(checks).toEqual({
      persisted: true,
      self: true,
      circular: true,
      crossType: true,
      archiveParent: true,
    });
  }, 30_000);
});

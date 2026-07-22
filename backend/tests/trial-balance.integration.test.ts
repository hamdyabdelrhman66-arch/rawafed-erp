import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { FinancialStatementsService } from "../src/services/financial-statements.service.js";

class RollbackTrialBalanceFixture extends Error {}

describe("trial balance", () => {
  it("returns opening, period, and closing values using the frontend API contract", async () => {
    const observed: Record<string, unknown> = {};

    await expect(
      prisma.$transaction(async (tx) => {
        const suffix = randomUUID().slice(0, 8);
        const branch = await tx.branch.findFirstOrThrow({
          where: { active: true, deletedAt: null },
        });
        const asset = await tx.chartOfAccount.create({
          data: {
            code: `TB-A-${suffix}`,
            name: "Trial balance asset",
            type: "ASSET",
            openingBalance: 100,
            normalBalance: "DEBIT",
          },
        });
        const equity = await tx.chartOfAccount.create({
          data: {
            code: `TB-EQ-${suffix}`,
            name: "Trial balance equity",
            type: "EQUITY",
            openingBalance: 100,
            normalBalance: "CREDIT",
          },
        });
        const revenue = await tx.chartOfAccount.create({
          data: {
            code: `TB-R-${suffix}`,
            name: "Trial balance revenue",
            type: "REVENUE",
          },
        });

        await tx.journalEntry.create({
          data: {
            entryNumber: `TB-PRIOR-${suffix}`,
            branchId: branch.id,
            postingDate: new Date("2026-06-30"),
            description: "Prior movement",
            status: "POSTED",
            sourceType: "trial_balance_test_prior",
            sourceId: suffix,
            lines: {
              create: [
                { accountId: asset.id, debit: 25 },
                { accountId: equity.id, credit: 25 },
              ],
            },
          },
        });
        await tx.journalEntry.create({
          data: {
            entryNumber: `TB-PERIOD-${suffix}`,
            branchId: branch.id,
            postingDate: new Date("2026-07-15"),
            description: "Period movement",
            status: "POSTED",
            sourceType: "trial_balance_test_period",
            sourceId: suffix,
            lines: {
              create: [
                { accountId: asset.id, debit: 200 },
                { accountId: revenue.id, credit: 200 },
              ],
            },
          },
        });

        const report = await new FinancialStatementsService(
          tx as unknown as PrismaClient,
        ).trialBalance({
          fromDate: "2026-07-01",
          toDate: "2026-07-31",
          displayMode: "activity",
          search: suffix,
        });
        const assetRow = report.rows.find((row) => row.accountId === asset.id);

        observed.rows = report.rows.length;
        observed.asset = assetRow;
        observed.totals = report.totals;
        observed.balanced = report.balanced;
        throw new RollbackTrialBalanceFixture();
      }),
    ).rejects.toBeInstanceOf(RollbackTrialBalanceFixture);

    expect(observed.rows).toBe(2);
    expect(observed.asset).toMatchObject({
      openingDebit: 125,
      openingCredit: 0,
      periodDebit: 200,
      periodCredit: 0,
      closingDebit: 325,
      closingCredit: 0,
    });
    expect(observed.totals).toMatchObject({
      openingDebit: 125,
      openingCredit: 0,
      periodDebit: 200,
      periodCredit: 200,
      closingDebit: 325,
      closingCredit: 200,
    });
    expect(observed.balanced).toBe(true);
  });
});

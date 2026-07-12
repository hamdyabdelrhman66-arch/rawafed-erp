import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import {
  EnterpriseReportService,
  REPORT_CATALOG,
} from "../src/services/enterprise-report.service.js";

class RollbackFixture extends Error {}

describe("enterprise reporting behavior", () => {
  it("exposes exactly 25 professional categories", () => {
    expect(new EnterpriseReportService(prisma).catalog()).toHaveLength(25);
    expect(REPORT_CATALOG.map(([id]) => id)).toHaveLength(25);
  });

  it.each(REPORT_CATALOG)(
    "executes %s against PostgreSQL",
    async (type) => {
      const report = await new EnterpriseReportService(prisma).run(type, {
        from: "2025-01-01",
        to: "2026-12-31",
      });
      expect(report.definition.id).toBe(type);
      expect(report.rows).toBeInstanceOf(Array);
      expect(report.columns).toBeInstanceOf(Array);
      expect(report.summary.rowCount).toBe(report.rows.length);
      expect(report.generatedAt).toEqual(expect.any(String));
    },
    30_000,
  );

  it("resolves quarters, compares periods, groups, and sorts server-side", async () => {
    const report = await new EnterpriseReportService(prisma).run(
      "accounting",
      { quarter: "Q2", year: "2026" },
      { groupBy: "metric", sortBy: "-amount" },
    );
    expect(report.filters.from).toBe("2026-04-01");
    expect(report.filters.to).toBe("2026-06-30");
    expect(report.comparison).toMatchObject({
      previousFrom: "2026-01-01",
      previousTo: "2026-03-31",
    });
    expect(report.rows.every((row) => "metric" in row && "rowCount" in row)).toBe(true);
    const amounts = report.rows.map((row) => Number(row.amount || 0));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
  }, 30_000);

  it("persists private saved templates transactionally", async () => {
    let observed = false;
    await expect(
      prisma.$transaction(async (tx) => {
        const role = await tx.role.findFirstOrThrow();
        const user = await tx.user.create({
          data: {
            username: `report-${randomUUID()}`,
            displayName: "Report Template Test",
            passwordHash: "not-used-by-this-test",
            roleId: role.id,
          },
        });
        const nestedClient = new Proxy(tx as unknown as PrismaClient, {
          get(target, property, receiver) {
            if (property === "$transaction")
              return async (operation: (client: Prisma.TransactionClient) => unknown) => operation(tx);
            return Reflect.get(target, property, receiver);
          },
        });
        const service = new EnterpriseReportService(nestedClient);
        const name = `Quarterly VAT ${randomUUID()}`;
        const created = await service.saveTemplate(user.id, {
          name,
          reportType: "vat",
          filters: { quarter: "Q1", year: "2026" },
          columns: ["metric", "amount"],
          groupBy: "metric",
          sortBy: "-amount",
          chartType: "bar",
        });
        const templates = await service.templates(user.id);
        observed = templates.some((template) => template.id === created.id);
        await service.removeTemplate(user.id, created.id);
        expect((await service.templates(user.id)).some((template) => template.id === created.id)).toBe(false);
        throw new RollbackFixture();
      }),
    ).rejects.toBeInstanceOf(RollbackFixture);
    expect(observed).toBe(true);
  }, 30_000);

  it("returns a report-only reconciliation result", async () => {
    const result = await new EnterpriseReportService(prisma).reconciliation();
    expect(result.correctionMode).toBe("report-only");
    expect(result).toHaveProperty("unbalancedJournalEntries");
    expect(result).toHaveProperty("duplicateSourcePostings");
    expect(result).toHaveProperty("receivablesMismatch");
    expect(result).toHaveProperty("trialBalanceMismatch");
    expect(result).toHaveProperty("balanceSheetMismatch");
    expect(result.unbalancedJournalEntries).toHaveLength(0);
    expect(result.duplicateSourcePostings).toHaveLength(0);
    expect(result.invoicesWithoutJournals).toHaveLength(0);
    expect(result.paymentsWithoutJournals).toHaveLength(0);
    expect(result.receivablesMismatch.difference).toBe(0);
    expect(result.dashboardMismatch).toBe(false);
    expect(result.trialBalanceMismatch).toBe(false);
    expect(result.balanceSheetMismatch).toBe(false);
    expect(result.invalidAccountHierarchy).toHaveLength(0);
  }, 30_000);
});

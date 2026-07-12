import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { JournalService } from "../src/services/journal.service.js";

const sourceIds: string[] = [];

afterEach(async () => {
  if (!sourceIds.length) return;
  await prisma.journalEntry.deleteMany({
    where: { sourceType: "concurrency_test", sourceId: { in: sourceIds } },
  });
  sourceIds.length = 0;
});

describe("PostgreSQL concurrency controls", () => {
  it("allows only one journal for concurrent retries of the same source", async () => {
    const account = await prisma.chartOfAccount.findFirstOrThrow({
      where: { active: true, deletedAt: null, allowPosting: true },
    });
    const sourceId = randomUUID();
    sourceIds.push(sourceId);
    const posting = {
      postingDate: new Date(),
      description: "Concurrent duplicate-source test",
      sourceType: "concurrency_test",
      sourceId,
      lines: [
        { accountId: account.id, debit: 1 },
        { accountId: account.id, credit: 1 },
      ],
    };
    const results = await Promise.allSettled([
      new JournalService(prisma).post(posting),
      new JournalService(prisma).post(posting),
      new JournalService(prisma).post(posting),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(
      await prisma.journalEntry.count({
        where: { sourceType: "concurrency_test", sourceId },
      }),
    ).toBe(1);
  }, 30_000);
});

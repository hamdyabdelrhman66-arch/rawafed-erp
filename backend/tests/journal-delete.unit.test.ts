import { describe, expect, it, vi } from "vitest";
import { JournalService } from "../src/services/journal.service.js";

const journal = (overrides: Record<string, unknown> = {}) => ({
  id: "journal-1",
  entryNumber: "JE-2026-00000001",
  postingDate: new Date("2026-08-10T00:00:00.000Z"),
  description: "Draft manual entry",
  referenceNumber: null,
  status: "DRAFT",
  sourceType: "manual_journal",
  automatic: false,
  createdById: "user-1",
  reversedFromId: null,
  correctedFromId: null,
  reversal: null,
  corrections: [],
  lines: [
    { debit: 100, credit: 0 },
    { debit: 0, credit: 100 },
  ],
  ...overrides,
});

const serviceWith = (record: ReturnType<typeof journal>) => {
  const remove = vi.fn().mockResolvedValue(record);
  const audit = vi.fn().mockResolvedValue({ id: "audit-1" });
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        username: "accountant",
        displayName: "Accountant",
        role: { name: "Accountant" },
      }),
    },
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(record),
      delete: remove,
    },
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: audit,
    },
  };
  const prisma = {
    $transaction: (work: (client: typeof tx) => unknown) => work(tx),
  };
  return {
    service: new JournalService(prisma as any),
    remove,
    audit,
  };
};

describe("journal deletion lifecycle", () => {
  it("deletes only a draft manual journal and writes its tombstone audit first", async () => {
    const { service, remove, audit } = serviceWith(journal());
    await service.deleteManual("journal-1", { id: "user-1", role: "Accountant" });

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "delete draft manual journal",
        entityType: "journal_entry_tombstone",
        entityId: "journal-1",
      }),
    }));
    expect(remove).toHaveBeenCalledWith({ where: { id: "journal-1" } });
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });

  it("preserves posted manual journals", async () => {
    const { service, remove, audit } = serviceWith(journal({ status: "POSTED" }));
    await expect(service.deleteManual("journal-1", { id: "user-1" }))
      .rejects.toMatchObject({ code: "POSTED_JOURNAL_IMMUTABLE", status: 409 });
    expect(remove).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("preserves automatic journals and their operational documents", async () => {
    const { service, remove, audit } = serviceWith(journal({
      status: "POSTED",
      sourceType: "finance_invoice",
      automatic: true,
    }));
    await expect(service.deleteManual("journal-1", { id: "user-1" }))
      .rejects.toMatchObject({ code: "OPERATIONAL_JOURNAL_DELETE_BLOCKED", status: 409 });
    expect(remove).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

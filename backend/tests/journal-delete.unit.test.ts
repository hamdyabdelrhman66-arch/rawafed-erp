import { describe, expect, it, vi } from "vitest";
import { JournalService } from "../src/services/journal.service.js";

const journal = (overrides: Record<string, unknown> = {}) => ({
  id: "journal-1",
  entryNumber: "JE-2026-00000001",
  postingDate: new Date("2026-08-10T00:00:00.000Z"),
  description: "Manual entry",
  referenceNumber: null,
  status: "POSTED",
  sourceType: "manual_journal",
  sourceId: "journal-1",
  automatic: false,
  createdById: "user-1",
  invoiceId: null,
  paymentId: null,
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

const serviceWith = (
  record: ReturnType<typeof journal>,
  options: { allocations?: Array<{ invoiceId: string; paymentId: string }> } = {},
) => {
  const audit = vi.fn().mockResolvedValue({ id: "audit-1" });
  const deleteJournals = vi.fn().mockResolvedValue({ count: 1 });
  const deleteInvoices = vi.fn().mockResolvedValue({ count: record.invoiceId ? 1 : 0 });
  const deletePayments = vi.fn().mockResolvedValue({ count: record.paymentId ? 1 : 0 });
  const allocations = options.allocations || [];
  const invoiceIds = [...new Set(allocations.map((row) => row.invoiceId))];
  const paymentIds = [...new Set(allocations.map((row) => row.paymentId))];
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        username: "administrator",
        displayName: "System Administrator",
        role: { name: "Super Admin" },
      }),
    },
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(record),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: deleteJournals,
    },
    paymentAllocation: { findMany: vi.fn().mockResolvedValue(allocations) },
    financeInvoice: {
      findMany: vi.fn().mockResolvedValue(invoiceIds.map((id) => ({ id, invoiceNumber: `INV-${id}`, accountId: "account-1" }))),
      deleteMany: deleteInvoices,
    },
    financePayment: {
      findMany: vi.fn().mockResolvedValue(paymentIds.map((id) => ({ id, receiptNumber: `REC-${id}`, accountId: "account-1" }))),
      deleteMany: deletePayments,
    },
    studentDiscount: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    accountingCustomer: { findMany: vi.fn().mockResolvedValue([]) },
    accountingOutbox: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    directCostEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: audit,
    },
  };
  const prisma = {
    $transaction: (work: (client: typeof tx) => unknown) => work(tx),
  };
  return { service: new JournalService(prisma as any), tx, audit, deleteJournals, deleteInvoices, deletePayments };
};

describe("journal permanent deletion", () => {
  it("permanently deletes a posted manual journal and its ledger lines", async () => {
    const { service, audit, deleteJournals } = serviceWith(journal());
    await service.deleteManual("journal-1", { id: "user-1", role: "Super Admin" });

    expect(deleteJournals).toHaveBeenCalledWith({ where: { id: { in: ["journal-1"] } } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "permanently delete journal and related financial documents",
        entityType: "journal_entry_tombstone",
        entityId: "journal-1",
      }),
    }));
  });

  it("deletes the connected invoice, payment, receipt allocation, and journals", async () => {
    const record = journal({
      sourceType: "finance_invoice",
      sourceId: "invoice-1",
      invoiceId: "invoice-1",
      automatic: true,
    });
    const { service, deleteInvoices, deletePayments } = serviceWith(record, {
      allocations: [{ invoiceId: "invoice-1", paymentId: "payment-1" }],
    });

    await service.deleteManual("journal-1", { id: "admin-1", role: "Super Admin" });

    expect(deletePayments).toHaveBeenCalledWith({ where: { id: { in: ["payment-1"] } } });
    expect(deleteInvoices).toHaveBeenCalledWith({ where: { id: { in: ["invoice-1"] } } });
  });

  it("rejects operational sources without a supported purge workflow", async () => {
    const { service, deleteJournals, audit } = serviceWith(journal({
      sourceType: "payroll_run",
      automatic: true,
    }));

    await expect(service.deleteManual("journal-1", { id: "admin-1", role: "Super Admin" }))
      .rejects.toMatchObject({ code: "JOURNAL_SOURCE_DELETE_NOT_SUPPORTED", status: 409 });
    expect(deleteJournals).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

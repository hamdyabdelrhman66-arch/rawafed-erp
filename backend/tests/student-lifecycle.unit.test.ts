import { describe, expect, it, vi } from "vitest";
import { StudentsService } from "../src/services/students.service.js";

const count = (value = 0) => ({ count: vi.fn().mockResolvedValue(value) });

const database = (invoiceCount: number) => {
  const student = {
    id: "student-1",
    registrationId: "registration-1",
    registrationNumber: "RAW-2026-000001",
    englishName: "Test Student",
    arabicName: "طالب اختبار",
    status: "active",
  };
  return {
    student: { findUnique: vi.fn().mockResolvedValue(student) },
    financeAccount: { findUnique: vi.fn().mockResolvedValue({ id: "finance-1" }) },
    accountingCustomer: { findUnique: vi.fn().mockResolvedValue(null) },
    financeInvoice: count(invoiceCount),
    financePayment: count(),
    journalEntry: count(),
    stockMovement: count(),
    uploadedFile: count(),
    directCostEvent: count(),
  };
};

describe("student archive and deletion safety", () => {
  it("reports the exact financial reference that blocks permanent deletion", async () => {
    const prisma = database(1);
    const eligibility = await new StudentsService(prisma as any).deletionEligibility("student-1");
    expect(eligibility).toMatchObject({
      eligible: false,
      counts: { invoices: 1, payments: 0, journals: 0 },
      reasons: ["invoices: 1"],
    });
  });

  it("does not enter the deletion transaction when a posted/history reference exists", async () => {
    const prisma = { ...database(1), $transaction: vi.fn() };
    await expect(new StudentsService(prisma as any).permanentlyDelete(
      "student-1",
      { reason: "Created in error", confirmation: "RAW-2026-000001" },
      { id: "admin-1", role: "Super Admin" },
    )).rejects.toMatchObject({ code: "STUDENT_DELETE_BLOCKED", status: 422 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

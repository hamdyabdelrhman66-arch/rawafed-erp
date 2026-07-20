import { describe, expect, it, vi } from "vitest";
import { FinanceService } from "../src/services/finance.service.js";
import { requirePermission } from "../src/middlewares/permission.middleware.js";

const invoiceRow = (category: string, paid: number, total = 115) => ({
  id: "11111111-1111-4111-8111-111111111111",
  invoiceNumber: `INV-${category}`,
  accountId: "account-1",
  registrationId: "registration-1",
  subtotal: 100,
  discount: 0,
  vatAmount: 15,
  total,
  serviceCategory: category,
  status: paid >= total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED",
  issuedAt: new Date("2026-07-01T00:00:00Z"),
  dueAt: new Date("2026-07-31T00:00:00Z"),
  createdAt: new Date("2026-07-01T00:00:00Z"),
  account: {
    currency: "SAR",
    registration: {
      registrationNumber: "RAW-2026-001",
      data: category === "TRANSPORTATION" ? { transportation: { route: "North", area: "Riyadh" } } : {},
      branch: { id: "branch-1", code: "HQ", name: "Main", nameAr: "الرئيسي" },
      academicYear: { name: "2026-2027" },
    },
    student: {
      id: "student-1", englishName: "Student", arabicName: "طالب", grade: "KG1", nationalId: "2123456789",
      parentName: "Guardian", parentPhone: "0500000000", registrationNumber: "RAW-2026-001", profile: {}, customer: { id: "customer-1" },
    },
  },
  registration: null,
  lines: [{ id: "line-1", description: category, quantity: 1, unitPrice: 100, vatRate: 15, netAmount: 100, vatAmount: 15, totalAmount: 115, revenueAccountId: null, revenueAccount: null }],
  payments: paid ? [{ id: "allocation-1", paymentId: "payment-1", amount: paid, payment: { receiptNumber: "REC-1", paidAt: new Date("2026-07-10T00:00:00Z"), method: "Cash", referenceNumber: null, status: "COMPLETED" } }] : [],
  journalEntries: [{ id: "journal-1", entryNumber: "JE-1", status: "POSTED", sourceType: "invoice", invoiceId: "11111111-1111-4111-8111-111111111111", postingDate: new Date("2026-07-01T00:00:00Z"), createdBy: { displayName: "Finance" }, notes: null }],
});

describe("invoice drill-down", () => {
  it.each([
    ["TUITION", 0, "Pending", 115],
    ["TRANSPORTATION", 50, "Partially Paid", 65],
    ["BOOKS", 115, "Paid", 0],
  ])("returns backend totals and status for %s", async (category, paid, status, remaining) => {
    const prisma = {
      financeInvoice: { findFirst: vi.fn().mockResolvedValue(invoiceRow(String(category), Number(paid))) },
      setting: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const detail = await new FinanceService(prisma).invoiceDetails("11111111-1111-4111-8111-111111111111");
    expect(detail.invoice.category).toBe(category);
    expect(detail.invoice.status).toBe(status);
    expect(detail.totals).toMatchObject({ subtotal: 100, vatAmount: 15, total: 115, paid, remaining });
    expect(detail.allocations).toHaveLength(paid ? 1 : 0);
    expect(detail.journal?.entryNumber).toBe("JE-1");
  });

  it("returns category-specific transportation details only when present", async () => {
    const prisma = { financeInvoice: { findFirst: vi.fn().mockResolvedValue(invoiceRow("TRANSPORTATION", 0)) }, setting: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    const detail = await new FinanceService(prisma).invoiceDetails("11111111-1111-4111-8111-111111111111");
    expect(detail.categoryDetails).toMatchObject({ grade: "KG1", route: "North", area: "Riyadh" });
    expect(detail.categoryDetails).not.toHaveProperty("size");
  });

  it("rejects a user without the invoice permission", async () => {
    const middleware = requirePermission({ rolePermission: { findFirst: vi.fn().mockResolvedValue(null) } } as any, "finance.invoices.view");
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();
    await middleware({ user: { id: "user-1", role: "Admissions" } } as any, response, next);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

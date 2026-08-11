import { describe, expect, it, vi } from "vitest";
import { JournalService } from "../src/services/journal.service.js";

describe("journal voucher details", () => {
  it("returns professional display fields for creator, accounts, branch and cost center", async () => {
    const entry = {
      id: "journal-1",
      entryNumber: "JE-2026-00000004",
      postingDate: new Date("2026-08-11T00:00:00.000Z"),
      createdAt: new Date("2026-08-11T09:30:00.000Z"),
      updatedAt: new Date("2026-08-11T09:31:00.000Z"),
      description: "Transfer",
      status: "POSTED",
      sourceType: "manual_journal",
      createdBy: { id: "user-1", displayName: "Finance Officer", username: "finance" },
      approvedBy: null,
      postedBy: { id: "user-2", displayName: "Finance Manager", username: "manager" },
      branch: { id: "branch-1", code: "MAIN", name: "Main", nameAr: "الفرع الرئيسي" },
      academicYear: { id: "year-1", name: "2026-2027" },
      reversal: null,
      reversedFrom: null,
      correctedFrom: null,
      corrections: [],
      lines: [
        {
          id: "line-1",
          debit: 1200,
          credit: 0,
          account: { code: "1100", nameAr: "الصندوق", nameEn: "Cash" },
          costCenter: { code: "ADM", nameAr: "الإدارة", nameEn: "Administration" },
        },
        {
          id: "line-2",
          debit: 0,
          credit: 1200,
          account: { code: "1110", nameAr: "البنك", nameEn: "Bank" },
          costCenter: null,
        },
      ],
    };
    const prisma = {
      journalEntry: { findFirst: vi.fn().mockResolvedValue(entry) },
      auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const result = await new JournalService(prisma as any).details("journal-1");

    expect(result.createdByName).toBe("Finance Officer");
    expect(result.postedByName).toBe("Finance Manager");
    expect(result.branchName).toBe("الفرع الرئيسي");
    expect(result.academicYearName).toBe("2026-2027");
    expect(result.lines[0]).toMatchObject({
      accountCode: "1100",
      accountNameAr: "الصندوق",
      accountNameEn: "Cash",
      costCenterCode: "ADM",
      debit: 1200,
      credit: 0,
    });
    expect(result.postingDate).toBe("2026-08-11T00:00:00.000Z");
  });
});

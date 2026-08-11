import { describe, expect, it, vi } from "vitest";
import { CashBankService } from "../src/services/cash-bank.service.js";

describe("cash and bank account projections", () => {
  it("shows a chart-of-accounts bank and its posted balance without requiring a duplicate bank master row", async () => {
    const prisma = {
      bank: { findMany: vi.fn().mockResolvedValue([]) },
      chartOfAccount: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "bank-account-1",
            code: "1110",
            name: "Bank",
            nameAr: "البنك",
            openingBalance: 0,
            active: true,
            notes: null,
            journalLines: [{ debit: 1000, credit: 0 }],
          },
        ]),
      },
    } as any;

    const banks = await new CashBankService(prisma).banks();

    expect(banks).toHaveLength(1);
    expect(banks[0]).toMatchObject({
      accountId: "bank-account-1",
      accountCode: "1110",
      bankName: "البنك",
      currentBalance: 1000,
    });
  });

  it("does not duplicate an account that already has bank master data", async () => {
    const account = {
      id: "bank-account-1",
      code: "1110",
      name: "Bank",
      nameAr: "البنك",
      openingBalance: 0,
      active: true,
      notes: null,
      journalLines: [{ debit: 1000, credit: 0 }],
    };
    const prisma = {
      bank: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "bank-master-1",
            accountId: account.id,
            bankName: "Rawafed Bank",
            iban: "SA0001",
            accountNumber: "001",
            active: true,
            notes: null,
            account,
          },
        ]),
      },
      chartOfAccount: { findMany: vi.fn().mockResolvedValue([account]) },
    } as any;

    const banks = await new CashBankService(prisma).banks();

    expect(banks).toHaveLength(1);
    expect(banks[0].id).toBe("bank-master-1");
    expect(banks[0].currentBalance).toBe(1000);
  });
});

import { describe, expect, it, vi } from "vitest";
import { CashBankService } from "../src/services/cash-bank.service.js";

const account = (overrides: Record<string, unknown> = {}) => ({
  id: "account-1",
  code: "1100",
  name: "Cash",
  nameAr: "النقدية",
  openingBalance: 0,
  openingDate: null,
  normalBalance: "DEBIT",
  active: true,
  notes: null,
  isCashAccount: true,
  isBankAccount: false,
  ...overrides,
});

describe("cash and bank ledger projections", () => {
  it("projects account 1100 as a cashbox and reconciles its closing balance to the GL", async () => {
    const prisma = {
      cashbox: { findMany: vi.fn().mockResolvedValue([]) },
      chartOfAccount: { findMany: vi.fn().mockResolvedValue([account()]) },
      journalLine: {
        groupBy: vi.fn().mockResolvedValue([
          { accountId: "account-1", _sum: { debit: 40_000, credit: 2_010 }, _count: { journalEntryId: 8 } },
        ]),
      },
    } as any;

    const cashboxes = await new CashBankService(prisma).cashboxes();

    expect(cashboxes).toHaveLength(1);
    expect(cashboxes[0]).toMatchObject({
      accountCode: "1100",
      currentBalance: 37_990,
      balanceAmount: 37_990,
      balanceSide: "DEBIT",
      transactionCount: 8,
    });
  });

  it("projects a bank account without a duplicate master row and presents credit balances without a negative display amount", async () => {
    const bank = account({
      id: "bank-account-1",
      code: "1110",
      name: "Bank",
      nameAr: "البنك",
      isCashAccount: false,
      isBankAccount: true,
    });
    const prisma = {
      bank: { findMany: vi.fn().mockResolvedValue([]) },
      chartOfAccount: { findMany: vi.fn().mockResolvedValue([bank]) },
      journalLine: {
        groupBy: vi.fn().mockResolvedValue([
          { accountId: bank.id, _sum: { debit: 0, credit: 1_000 }, _count: { journalEntryId: 1 } },
        ]),
      },
    } as any;

    const banks = await new CashBankService(prisma).banks();

    expect(banks[0]).toMatchObject({
      currentBalance: -1_000,
      balanceAmount: 1_000,
      balanceSide: "CREDIT",
    });
  });

  it("does not duplicate an account that already has master data", async () => {
    const bankAccount = account({
      id: "bank-account-1",
      code: "1110",
      isCashAccount: false,
      isBankAccount: true,
    });
    const prisma = {
      bank: { findMany: vi.fn().mockResolvedValue([{ id: "bank-master-1", accountId: bankAccount.id, bankName: "Rawafed Bank", iban: null, accountNumber: null, active: true, notes: null, account: bankAccount }]) },
      chartOfAccount: { findMany: vi.fn().mockResolvedValue([bankAccount]) },
      journalLine: { groupBy: vi.fn().mockResolvedValue([]) },
    } as any;

    const banks = await new CashBankService(prisma).banks();

    expect(banks).toHaveLength(1);
    expect(banks[0].id).toBe("bank-master-1");
  });

  it("requires an explicit chart-of-accounts mapping when creating a cashbox", async () => {
    const prisma = { $transaction: vi.fn(async (operation) => operation(prisma)) } as any;
    await expect(new CashBankService(prisma).createCashbox({ name: "Main Cash" }))
      .rejects.toMatchObject({ code: "ACCOUNT_MAPPING_REQUIRED", status: 422 });
  });

  it("rejects a duplicate live cash or bank mapping", async () => {
    const mapped = account();
    const prisma: any = {
      $transaction: vi.fn(async (operation) => operation(prisma)),
      chartOfAccount: { findFirst: vi.fn().mockResolvedValue(mapped) },
      cashbox: { findFirst: vi.fn().mockResolvedValue({ id: "existing" }) },
      bank: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(new CashBankService(prisma).createCashbox({ name: "Main Cash", accountId: mapped.id }))
      .rejects.toMatchObject({ code: "DUPLICATE_ACCOUNT_MAPPING", status: 409 });
  });
});

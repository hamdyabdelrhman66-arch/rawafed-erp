import { describe, expect, it, vi } from "vitest";
import {
  goodsReceiptJournalLines,
  PurchaseService,
} from "../src/services/purchase.service.js";

describe("goods receipt accounting", () => {
  it("capitalizes inventory, records input VAT, and credits the supplier payable", () => {
    const lines = goodsReceiptJournalLines({
      inventoryAccountId: "inventory",
      inputVatAccountId: "vat-input",
      payableAccountId: "supplier-payable",
      subtotal: 1_000,
      vatTotal: 150,
    });
    expect(lines).toEqual([
      { accountId: "inventory", debit: 1_000 },
      { accountId: "vat-input", debit: 150 },
      { accountId: "supplier-payable", credit: 1_150 },
    ]);
    expect(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0))
      .toBe(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  });

  it("does not create a VAT line for a zero-rated receipt", () => {
    const lines = goodsReceiptJournalLines({
      inventoryAccountId: "inventory",
      payableAccountId: "supplier-payable",
      subtotal: 800,
      vatTotal: 0,
    });
    expect(lines).toEqual([
      { accountId: "inventory", debit: 800 },
      { accountId: "supplier-payable", credit: 800 },
    ]);
  });

  it("returns the existing receipt on an idempotent retry without starting a second transaction", async () => {
    const existing = { id: "receipt-1", grnNumber: "GRN-retry-key-123" };
    const prisma = {
      goodsReceipt: { findFirst: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(),
    } as any;

    const result = await new PurchaseService(prisma).goodsReceipt({
      idempotencyKey: "retry-key-123",
    });

    expect(result).toBe(existing);
    expect(prisma.goodsReceipt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { grnNumber: "GRN-retry-key-123", deletedAt: null },
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("checks all required mappings before creating stock or receipt records", async () => {
    const tx = {
      accountingSupplier: {
        findFirst: vi.fn().mockResolvedValue({
          id: "supplier-1",
          payableAccountId: "payable-1",
        }),
      },
      chartOfAccount: { findUnique: vi.fn().mockResolvedValue(null) },
      goodsReceipt: { create: vi.fn() },
      stockMovement: { create: vi.fn() },
      inventoryStock: { upsert: vi.fn() },
      journalEntry: { create: vi.fn() },
    };
    const prisma = {
      goodsReceipt: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: any) => callback(tx)),
    } as any;

    await expect(
      new PurchaseService(prisma).goodsReceipt({
        idempotencyKey: "mapping-check-123",
        supplierId: "supplier-1",
        warehouseId: "warehouse-1",
        items: [
          { itemId: "item-1", quantity: 2, unitPrice: 100, vatRate: 15 },
        ],
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_MAPPING_MISSING" });

    expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.inventoryStock.upsert).not.toHaveBeenCalled();
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

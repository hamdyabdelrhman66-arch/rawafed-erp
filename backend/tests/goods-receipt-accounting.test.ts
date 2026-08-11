import { describe, expect, it } from "vitest";
import { goodsReceiptJournalLines } from "../src/services/purchase.service.js";

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
});

import { describe, expect, it } from "vitest";
import { calculateStudentDiscount, splitInvoiceDiscount } from "../src/services/student-discount.js";

describe("student discount domain", () => {
  it("reduces 14,000 by a fixed 2,000 without treating it as payment", () => {
    expect(calculateStudentDiscount({ grossFees: 14_000, previousDiscounts: 0, totalPaid: 0, discountType: "FIXED", discountValue: 2_000 })).toEqual({
      amount: 2_000, discountableBalance: 14_000, totalDiscounts: 2_000, netFees: 12_000, outstandingBalance: 12_000,
    });
  });

  it("calculates ten percent of 14,000 as 1,400", () => {
    expect(calculateStudentDiscount({ grossFees: 14_000, previousDiscounts: 0, totalPaid: 0, discountType: "PERCENTAGE", discountValue: 10 }).amount).toBe(1_400);
  });

  it("rejects a discount greater than the unpaid discountable balance", () => {
    expect(() => calculateStudentDiscount({ grossFees: 14_000, previousDiscounts: 2_000, totalPaid: 5_000, discountType: "FIXED", discountValue: 7_001 })).toThrow("DISCOUNT_EXCEEDS_AVAILABLE_BALANCE");
  });

  it("keeps payment and discount separate when calculating the remaining balance", () => {
    expect(calculateStudentDiscount({ grossFees: 14_000, previousDiscounts: 0, totalPaid: 5_000, discountType: "FIXED", discountValue: 2_000 }).outstandingBalance).toBe(7_000);
  });

  it("splits a VAT-inclusive adjustment without applying VAT twice", () => {
    expect(splitInvoiceDiscount(2_300, { subtotal: 10_000, discount: 0, vatAmount: 1_500, governmentBorneVat: 0 })).toEqual({ baseAmount: 2_000, vatAmount: 300, governmentBorneVat: 0 });
  });

  it("rejects zero and negative discounts", () => {
    for (const value of [0, -1])
      expect(() => calculateStudentDiscount({ grossFees: 14_000, previousDiscounts: 0, totalPaid: 0, discountType: "FIXED", discountValue: value })).toThrow("DISCOUNT_VALUE_REQUIRED");
  });

  it("rejects a percentage above one hundred", () => {
    expect(() => calculateStudentDiscount({ grossFees: 14_000, previousDiscounts: 0, totalPaid: 0, discountType: "PERCENTAGE", discountValue: 100.01 })).toThrow("DISCOUNT_PERCENTAGE_INVALID");
  });

  it("allows a discount equal to the available unpaid balance without a negative net", () => {
    expect(calculateStudentDiscount({ grossFees: 14_000, previousDiscounts: 2_000, totalPaid: 5_000, discountType: "FIXED", discountValue: 7_000 })).toMatchObject({ totalDiscounts: 9_000, netFees: 5_000, outstandingBalance: 0 });
  });

  it("keeps the actual payment total unchanged by a discount", () => {
    const actualCashReceived = 5_000;
    const result = calculateStudentDiscount({ grossFees: 14_000, previousDiscounts: 0, totalPaid: actualCashReceived, discountType: "FIXED", discountValue: 2_000 });
    expect(actualCashReceived).toBe(5_000);
    expect(result.totalDiscounts).toBe(2_000);
    expect(result.outstandingBalance).toBe(7_000);
  });

  it("does not invent VAT for an exempt invoice", () => {
    expect(splitInvoiceDiscount(2_000, { subtotal: 14_000, discount: 0, vatAmount: 0, governmentBorneVat: 0 })).toEqual({ baseAmount: 2_000, vatAmount: 0, governmentBorneVat: 0 });
  });
});

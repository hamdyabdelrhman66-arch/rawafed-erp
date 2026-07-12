import { describe, expect, it } from "vitest";
import {
  allocateHalf,
  allocateRemaining,
} from "../../src/app/core/finance/payment-allocation.js";

const sixFees = [
  { feeItem: "Registration Fee", expected: 5700 },
  { feeItem: "Tuition", expected: 30000 },
  { feeItem: "Books", expected: 2000 },
  { feeItem: "Uniform", expected: 1500 },
  { feeItem: "Activities", expected: 2000 },
  { feeItem: "Transportation", expected: 2500 },
];

describe("quick payment allocation", () => {
  it("Pay Remaining includes every fee and totals 43,700", () => {
    const allocation = allocateRemaining(sixFees);
    expect(allocation).toEqual([5700, 30000, 2000, 1500, 2000, 2500]);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(43700);
  });

  it("Pay 50% allocates proportionally and totals exactly 21,850", () => {
    const allocation = allocateHalf(sixFees);
    expect(
      allocation.every(
        (value, index) => value > 0 && value <= sixFees[index].expected,
      ),
    ).toBe(true);
    expect(
      allocation.reduce(
        (sum, value) => Math.round((sum + value) * 100) / 100,
        0,
      ),
    ).toBe(21850);
  });

  it("handles custom items, paid items, and rounding remainder", () => {
    const items = [
      { feeItem: "Paid item", expected: 0 },
      { feeItem: "Custom A", expected: 10.01 },
      { feeItem: "Custom B", expected: 10 },
      { feeItem: "Custom C", expected: 9.99 },
    ];
    expect(allocateHalf(items)).toEqual([0, 5.01, 5, 4.99]);
  });
});

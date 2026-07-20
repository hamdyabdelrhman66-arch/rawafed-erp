import { describe, expect, it } from "vitest";
import { payment } from "../src/validators/core.validators.js";

const validPayment = {
  accountId: "c56a4180-65aa-42ec-a945-5fd21dec0538",
  invoiceId: "1c6a2ef4-9825-46b3-9206-57b4a8e706fd",
  receiptNumber: "REC-TEST-1",
  amount: 1250,
  method: "Cash",
  paidAt: "2026-07-13",
  lines: [
    { feeItem: "Tuition", amount: 1000 },
    { feeItem: "Books", amount: 250 },
  ],
};

describe("payment request validator", () => {
  it("accepts the add-payment page payload with a date and fee-item lines", () => {
    expect(payment.safeParse(validPayment).success).toBe(true);
  });

  it("also accepts a full ISO payment timestamp", () => {
    expect(
      payment.safeParse({
        ...validPayment,
        paidAt: "2026-07-13T09:30:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("preserves the 11,902.50 SAR payment and its five exact allocations", () => {
    const result = payment.parse({
      ...validPayment,
      amount: 11902.5,
      paidAt: "2026-07-19",
      lines: [
        { feeItem: "Tuition", amount: 8625 },
        { feeItem: "Books", amount: 632.5 },
        { feeItem: "Uniform", amount: 517.5 },
        { feeItem: "Activities", amount: 402.5 },
        { feeItem: "Transportation", amount: 1725 },
      ],
    });
    expect(Math.round(result.amount * 100)).toBe(1190250);
    expect(result.lines?.reduce((sum, line) => sum + Math.round(line.amount * 100), 0)).toBe(1190250);
  });

  it("still rejects unknown request fields", () => {
    expect(
      payment.safeParse({ ...validPayment, unexpected: true }).success,
    ).toBe(false);
  });
});

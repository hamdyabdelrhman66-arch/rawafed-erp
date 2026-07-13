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

  it("still rejects unknown request fields", () => {
    expect(
      payment.safeParse({ ...validPayment, unexpected: true }).success,
    ).toBe(false);
  });
});

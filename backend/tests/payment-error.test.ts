import { describe, expect, it } from "vitest";
import { classifyPaymentError } from "../src/services/payment-error.js";
import { ServiceError } from "../src/services/service.error.js";

describe("payment error classification", () => {
  it.each([
    ["P1001", "DATABASE_UNAVAILABLE", 503],
    ["P2024", "TRANSACTION_TIMEOUT", 504],
    ["P2028", "TRANSACTION_TIMEOUT", 504],
    ["P2002", "DUPLICATE_PAYMENT", 409],
    ["P2003", "INVALID_PAYMENT_ALLOCATION", 422],
    ["P2034", "TRANSACTION_CONFLICT", 409],
  ])("maps Prisma %s without hiding the original code", (originalCode, errorCode, status) => {
    const error = classifyPaymentError(Object.assign(new Error("database detail"), { code: originalCode }), "PAYMENT_CREATION");
    expect(error).toMatchObject({ code: errorCode, status, originalCode, step: "PAYMENT_CREATION" });
  });

  it("does not replace a precise business error", () => {
    const original = new ServiceError("Period closed", 409, "CLOSED_ACCOUNTING_PERIOD");
    expect(classifyPaymentError(original, "AUTOMATIC_JOURNAL")).toBe(original);
  });

  it("identifies an unclassified journal failure without calling it a database outage", () => {
    expect(classifyPaymentError(new Error("unexpected"), "AUTOMATIC_JOURNAL").code).toBe("JOURNAL_POSTING_FAILED");
  });
});

import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateInclusivePaymentTax, taxEventRecognitionStatus } from "../src/services/tuition-tax.service.js";

const numbers = (value: ReturnType<typeof calculateInclusivePaymentTax>) => ({
  gross: Number(value.grossAmount),
  net: Number(value.taxableAmount),
  parentVat: Number(value.parentVat),
  governmentVat: Number(value.governmentBorneVat),
});

describe("tuition payment tax-event calculations", () => {
  it("splits SAR 1,840 into SAR 1,600 net and SAR 240 VAT", () => {
    expect(numbers(calculateInclusivePaymentTax({ grossAmount: new Prisma.Decimal("1840"), vatRate: "15", taxTreatment: "STANDARD" })))
      .toEqual({ gross: 1840, net: 1600, parentVat: 240, governmentVat: 0 });
  });

  it("splits the second SAR 3,450 payment into SAR 3,000 net and SAR 450 VAT", () => {
    expect(numbers(calculateInclusivePaymentTax({ grossAmount: "3450", vatRate: "15", taxTreatment: "STANDARD" })))
      .toEqual({ gross: 3450, net: 3000, parentVat: 450, governmentVat: 0 });
    expect(new Prisma.Decimal("13800").minus("1840").minus("3450").toNumber()).toBe(8510);
  });

  it("keeps government-borne VAT separate from the amount collected from the parent", () => {
    expect(numbers(calculateInclusivePaymentTax({ grossAmount: "13000", vatRate: "15", taxTreatment: "GOVERNMENT_BORNE" })))
      .toEqual({ gross: 13000, net: 13000, parentVat: 0, governmentVat: 1950 });
  });

  it.each(["ZERO_RATE", "EXEMPT"])("does not invent VAT for %s treatment", (taxTreatment) => {
    expect(numbers(calculateInclusivePaymentTax({ grossAmount: "1840", vatRate: "15", taxTreatment })))
      .toEqual({ gross: 1840, net: 1840, parentVat: 0, governmentVat: 0 });
  });

  it("rejects invalid money and VAT rates", () => {
    expect(() => calculateInclusivePaymentTax({ grossAmount: 0, vatRate: 15, taxTreatment: "STANDARD" })).toThrow();
    expect(() => calculateInclusivePaymentTax({ grossAmount: 100, vatRate: 101, taxTreatment: "STANDARD" })).toThrow();
  });

  it("recognizes invoice events only under invoice/accrual basis", () => {
    expect(taxEventRecognitionStatus("INVOICE_ACCRUAL", "INVOICE_ISSUED")).toBe("RECOGNIZED");
    expect(taxEventRecognitionStatus("INVOICE_ACCRUAL", "PAYMENT_COLLECTED")).toBe("INFORMATIONAL");
  });

  it("recognizes payment events only under cash basis", () => {
    expect(taxEventRecognitionStatus("CASH", "INVOICE_ISSUED")).toBe("INFORMATIONAL");
    expect(taxEventRecognitionStatus("CASH", "PAYMENT_COLLECTED")).toBe("RECOGNIZED");
  });

  it("keeps cumulative net and VAT exact across multiple payments", () => {
    const first = calculateInclusivePaymentTax({ grossAmount: "1840", vatRate: "15", taxTreatment: "STANDARD" });
    const second = calculateInclusivePaymentTax({ grossAmount: "3450", vatRate: "15", taxTreatment: "STANDARD" });
    expect(Number(first.taxableAmount.plus(second.taxableAmount))).toBe(4600);
    expect(Number(first.parentVat.plus(second.parentVat))).toBe(690);
    expect(Number(first.grossAmount.plus(second.grossAmount))).toBe(5290);
  });
});

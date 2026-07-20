import { describe, expect, it } from "vitest";
import { calculateFeePreview, resolveVatEligibility } from "../src/services/student-vat.js";
import { RegistrationsService } from "../src/services/registrations.service.js";

const policies = [
  ["REGISTRATION", "GOVERNMENT_BORNE"],
  ["TUITION", "GOVERNMENT_BORNE"],
  ["BOOKS", "STANDARD"],
  ["UNIFORM", "STANDARD"],
  ["TRANSPORTATION", "STANDARD"],
  ["ACTIVITIES", "STANDARD"],
  ["OTHER_SERVICES", "STANDARD"],
].map(([category, saudiTaxTreatment]) => ({
  category,
  taxTreatment: "STANDARD",
  saudiTaxTreatment,
  vatRate: 15,
  active: true,
}));

const saudi = { nationality: "Saudi Arabia", identityType: "NATIONAL_ID", identityNumber: "1123456789" };
const resident = { nationality: "Egyptian", identityType: "IQAMA", identityNumber: "2123456789" };
const preview = (identity: typeof saudi, lines: Array<[string, string, number]>) => calculateFeePreview(
  identity,
  lines.map(([name, category, amount]) => ({ name, category, amount })),
  policies,
);

describe("authoritative Saudi education VAT", () => {
  it("1. accepts a Saudi student with a valid National ID starting with 1", () => {
    expect(resolveVatEligibility(saudi).classification).toBe("SAUDI_CITIZEN");
  });

  it("2. accepts a non-Saudi student with an Iqama starting with 2", () => {
    expect(resolveVatEligibility(resident).classification).toBe("NON_SAUDI_RESIDENT");
  });

  it("3. rejects Saudi nationality with a conflicting Iqama", () => {
    expect(() => resolveVatEligibility({ ...resident, nationality: "Saudi" })).toThrow(/conflicts|تتعارض/);
  });

  it("4. rejects non-Saudi nationality with a conflicting National ID", () => {
    expect(() => resolveVatEligibility({ ...saudi, nationality: "Egyptian" })).toThrow(/conflicts|تتعارض/);
  });

  it("5. rejects a missing identity number", () => {
    expect(() => resolveVatEligibility({ ...saudi, identityNumber: "" })).toThrow(/required|مطلوب/);
  });

  it("6. rejects an invalid identity number", () => {
    expect(() => resolveVatEligibility({ ...saudi, identityNumber: "123" })).toThrow(/10 digits|10 أرقام/);
  });

  it("7. recalculates from non-Saudi to Saudi without retaining charged tuition VAT", () => {
    const before = preview(resident, [["Tuition", "TUITION", 16_000]]);
    const after = preview(saudi, [["Tuition", "TUITION", 16_000]]);
    expect(before.parentPayableTotal).toBe(18_400);
    expect(after.parentPayableTotal).toBe(16_000);
    expect(after.governmentBorneAmount).toBe(2_400);
    expect(after.decisionHash).not.toBe(before.decisionHash);
  });

  it("8. recalculates from Saudi to non-Saudi and changes the decision hash", () => {
    const before = preview(saudi, [["Tuition", "TUITION", 20_000]]);
    const after = preview(resident, [["Tuition", "TUITION", 20_000]]);
    expect(after.chargedVat).toBe(3_000);
    expect(after.decisionHash).not.toBe(before.decisionHash);
  });

  it("9. calculates tuition-only registration", () => {
    const result = preview(saudi, [["Tuition", "TUITION", 16_000]]);
    expect(result).toMatchObject({ subtotal: 16_000, totalVat: 2_400, governmentBorneAmount: 2_400, parentPayableTotal: 16_000 });
  });

  it("10. calculates tuition and books by separate category policies", () => {
    const result = preview(saudi, [["Tuition", "TUITION", 16_000], ["Books", "BOOKS", 1_000]]);
    expect(result).toMatchObject({ subtotal: 17_000, totalVat: 2_550, chargedVat: 150, governmentBorneAmount: 2_400, parentPayableTotal: 17_150 });
  });

  it("11. calculates tuition and uniform by separate category policies", () => {
    expect(preview(saudi, [["Tuition", "TUITION", 16_000], ["Uniform", "UNIFORM", 800]]).parentPayableTotal).toBe(16_920);
  });

  it("12. calculates tuition and transportation by separate category policies", () => {
    expect(preview(saudi, [["Tuition", "TUITION", 16_000], ["Transportation", "TRANSPORTATION", 2_000]]).chargedVat).toBe(300);
  });

  it("13. supports mixed service categories", () => {
    const result = preview(saudi, [["Registration", "REGISTRATION", 1_000], ["Tuition", "TUITION", 16_000], ["Books", "BOOKS", 1_000], ["Activities", "ACTIVITIES", 500]]);
    expect(result.lines.map((line) => line.treatment)).toEqual(["GOVERNMENT_BORNE", "GOVERNMENT_BORNE", "STANDARD", "STANDARD"]);
  });

  it("14. provides a Saudi invoice snapshot with taxable VAT preserved", () => {
    const result = preview(saudi, [["Tuition", "TUITION", 16_000]]);
    expect(result.lines[0]).toMatchObject({ vatRate: 15, vatAmount: 2_400, chargedVat: 0, treatment: "GOVERNMENT_BORNE" });
  });

  it("15. provides a non-Saudi standard-rate invoice snapshot", () => {
    expect(preview(resident, [["Tuition", "TUITION", 16_000]]).lines[0]).toMatchObject({ vatRate: 15, vatAmount: 2_400, chargedVat: 2_400, treatment: "STANDARD" });
  });

  it("16. backend rejects a manipulated or stale frontend VAT hash", async () => {
    const prisma = {
      revenueCategoryMapping: { findMany: async () => policies },
      $transaction: () => { throw new Error("transaction must not start"); },
    } as any;
    const service = new RegistrationsService(prisma);
    await expect(service.create({
      student: { ...saudi, nationalId: saudi.identityNumber },
      financial: { tuition: 16_000, taxDecisionHash: "manipulated" },
    })).rejects.toMatchObject({ code: "STALE_VAT_PREVIEW", status: 409 });
  });

  it("17. registration parent total equals the invoice parent-payable total", () => {
    const registration = preview(resident, [["Tuition", "TUITION", 20_700]]);
    const invoiceTotal = registration.lines.reduce((sum, line) => sum + line.parentPayable, 0);
    expect(registration.parentPayableTotal).toBe(invoiceTotal);
  });

  it("18. invoice journal balances using the approved government-borne treatment", () => {
    const result = preview(saudi, [["Tuition", "TUITION", 16_000]]);
    const debit = result.parentPayableTotal + result.governmentBorneAmount;
    const credit = result.subtotal + result.totalVat;
    expect(debit).toBe(credit);
  });
});

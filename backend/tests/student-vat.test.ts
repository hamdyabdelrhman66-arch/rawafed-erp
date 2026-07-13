import { describe, expect, it } from "vitest";
import {
  isSaudiNationalId,
  vatForSubtotal,
  vatRateForStudent,
} from "../src/services/student-vat.js";

describe("Saudi student VAT rule", () => {
  it("exempts national IDs starting with 1", () => {
    expect(isSaudiNationalId("1123456789")).toBe(true);
    expect(vatRateForStudent("1123456789")).toBe(0);
    expect(vatForSubtotal(25500, "1123456789")).toBe(0);
  });

  it("charges 15 percent for any other captured national ID", () => {
    expect(isSaudiNationalId("2123456789")).toBe(false);
    expect(vatRateForStudent("2123456789")).toBe(15);
    expect(vatForSubtotal(25500, "2123456789")).toBe(3825);
  });
});

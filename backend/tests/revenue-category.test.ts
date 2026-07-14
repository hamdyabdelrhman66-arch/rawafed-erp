import { describe, expect, it } from "vitest";
import { categoryLabel, revenueCategory } from "../src/services/revenue-category.js";

describe("revenue category classification", () => {
  it.each([
    ["Registration Fee", "REGISTRATION"],
    ["School Fees", "TUITION"],
    ["Books", "BOOKS"],
    ["Uniform", "UNIFORM"],
    ["Bus Fee", "TRANSPORTATION"],
    ["Activities", "ACTIVITIES"],
    ["Optional Service", "OTHER_SERVICES"],
  ])("maps %s to %s", (value, expected) => {
    expect(revenueCategory(value)).toBe(expected);
  });

  it("keeps legacy invoices clearly labelled", () => {
    expect(categoryLabel("LEGACY_COMBINED")).toBe("Legacy Combined Invoice");
  });
});

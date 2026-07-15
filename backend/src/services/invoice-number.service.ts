import type { DatabaseClient } from "../repositories/repository.types.js";
import { revenueCategory, type RevenueCategory } from "./revenue-category.js";

const categoryCodes: Record<RevenueCategory, string> = {
  REGISTRATION: "REG",
  TUITION: "TUI",
  BOOKS: "BOOK",
  UNIFORM: "UNI",
  TRANSPORTATION: "BUS",
  ACTIVITIES: "ACT",
  OTHER_SERVICES: "OTH",
};

export async function nextInvoiceNumber(
  tx: DatabaseClient,
  categoryInput: unknown,
  issuedAt = new Date(),
): Promise<string> {
  const category = revenueCategory(categoryInput);
  const year = issuedAt.getUTCFullYear();
  const sequence = await tx.invoiceSequence.upsert({
    where: { category_year: { category, year } },
    create: { category, year, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  });
  const number = sequence.nextNumber - 1;
  return `RAW-${categoryCodes[category]}-${year}-${String(number).padStart(6, "0")}`;
}

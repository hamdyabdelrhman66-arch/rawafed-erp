import type { DatabaseClient } from "../repositories/repository.types.js";
import { ServiceError } from "./service.error.js";

export const REVENUE_CATEGORIES = [
  "REGISTRATION", "TUITION", "BOOKS", "UNIFORM", "TRANSPORTATION", "ACTIVITIES", "OTHER_SERVICES",
] as const;

export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

export function revenueCategory(value: unknown): RevenueCategory {
  const text = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (text.includes("REGISTRATION")) return "REGISTRATION";
  if (text.includes("TUITION") || text.includes("SCHOOL_FEE")) return "TUITION";
  if (text.includes("BOOK")) return "BOOKS";
  if (text.includes("UNIFORM")) return "UNIFORM";
  if (text.includes("TRANSPORT") || text.includes("BUS")) return "TRANSPORTATION";
  if (text.includes("ACTIVIT")) return "ACTIVITIES";
  return "OTHER_SERVICES";
}

export const categoryLabel = (category: string) =>
  ({
    REGISTRATION: "Registration", TUITION: "Tuition", BOOKS: "Books", UNIFORM: "Uniform",
    TRANSPORTATION: "Transportation", ACTIVITIES: "Activities", OTHER_SERVICES: "Other Services",
    LEGACY_COMBINED: "Legacy Combined Invoice",
  })[category] || category;

export async function mappingFor(tx: DatabaseClient, category: RevenueCategory) {
  const mapping = await tx.revenueCategoryMapping.findUnique({ where: { category } });
  if (!mapping?.active)
    throw new ServiceError(`Accounting mapping is not configured for ${category}.`, 422, "MAPPING_REQUIRED");
  const [revenue, cost, receivable, inventory] = await Promise.all([
    tx.chartOfAccount.findUnique({ where: { id: mapping.revenueAccountId } }),
    mapping.costAccountId ? tx.chartOfAccount.findUnique({ where: { id: mapping.costAccountId } }) : null,
    mapping.receivableAccountId ? tx.chartOfAccount.findUnique({ where: { id: mapping.receivableAccountId } }) : null,
    mapping.inventoryAccountId ? tx.chartOfAccount.findUnique({ where: { id: mapping.inventoryAccountId } }) : null,
  ]);
  if (!revenue) throw new ServiceError(`Revenue account is missing for ${category}.`, 422, "MAPPING_REQUIRED");
  return { ...mapping, revenue, cost, receivable, inventory };
}

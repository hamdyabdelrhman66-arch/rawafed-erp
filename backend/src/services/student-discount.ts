export type DiscountType = "FIXED" | "PERCENTAGE";

const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
export const discountMoney = (value: unknown) => cents(value) / 100;

export function calculateStudentDiscount(input: {
  grossFees: number;
  previousDiscounts: number;
  totalPaid: number;
  discountType: DiscountType;
  discountValue: number;
}) {
  const grossCents = cents(input.grossFees);
  const previousCents = cents(input.previousDiscounts);
  const paidCents = cents(input.totalPaid);
  const value = Number(input.discountValue);
  if (!Number.isFinite(value) || value <= 0) throw new Error("DISCOUNT_VALUE_REQUIRED");
  if (input.discountType === "PERCENTAGE" && value > 100) throw new Error("DISCOUNT_PERCENTAGE_INVALID");
  const amountCents = input.discountType === "FIXED"
    ? cents(value)
    : Math.round(grossCents * value / 100);
  const discountableCents = Math.max(grossCents - previousCents - paidCents, 0);
  if (amountCents > discountableCents) throw new Error("DISCOUNT_EXCEEDS_AVAILABLE_BALANCE");
  const totalDiscountCents = previousCents + amountCents;
  if (totalDiscountCents > grossCents) throw new Error("DISCOUNT_EXCEEDS_GROSS_FEES");
  const netCents = grossCents - totalDiscountCents;
  return {
    amount: amountCents / 100,
    discountableBalance: discountableCents / 100,
    totalDiscounts: totalDiscountCents / 100,
    netFees: netCents / 100,
    outstandingBalance: Math.max(netCents - paidCents, 0) / 100,
  };
}

export function splitInvoiceDiscount(amount: number, invoice: {
  subtotal: unknown;
  discount?: unknown;
  vatAmount?: unknown;
  governmentBorneVat?: unknown;
}) {
  const taxableBase = Math.max(discountMoney(invoice.subtotal) - discountMoney(invoice.discount), 0);
  const chargedVatRate = taxableBase ? discountMoney(invoice.vatAmount) / taxableBase : 0;
  const governmentVatRate = taxableBase ? discountMoney(invoice.governmentBorneVat) / taxableBase : 0;
  const baseAmount = chargedVatRate > 0 ? discountMoney(amount / (1 + chargedVatRate)) : discountMoney(amount);
  const vatAmount = discountMoney(amount - baseAmount);
  const governmentBorneVat = discountMoney(baseAmount * governmentVatRate);
  return { baseAmount, vatAmount, governmentBorneVat };
}


import { Prisma, type FinanceDocumentType, type TaxEventStatus, type TaxEventType, type VatAccountingBasis } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "../repositories/repository.types.js";
import type { Actor } from "../dto/core.dto.js";
import { ServiceError } from "./service.error.js";

const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
const currency = (value: Prisma.Decimal.Value) => D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const PREFIX: Record<FinanceDocumentType, string> = {
  FEE_AGREEMENT: "FEE",
  TAX_INVOICE: "TAX",
  PAYMENT_RECEIPT: "REC",
  CREDIT_NOTE: "CN",
  DEBIT_NOTE: "DN",
};

export async function nextFinanceDocumentNumber(
  tx: DatabaseClient,
  documentType: FinanceDocumentType,
  date = new Date(),
): Promise<string> {
  const year = date.getUTCFullYear();
  const sequence = await tx.financeDocumentSequence.upsert({
    where: { documentType_year: { documentType, year } },
    create: { id: randomUUID(), documentType, year, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });
  return `${PREFIX[documentType]}-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}

export async function vatAccountingBasisUsing(tx: DatabaseClient): Promise<VatAccountingBasis> {
  const setting = await tx.setting.findUnique({ where: { key: "vat_accounting_basis" } });
  const raw = typeof setting?.value === "string"
    ? setting.value
    : String((setting?.value as Record<string, unknown> | null)?.basis || "INVOICE_ACCRUAL");
  return raw === "CASH" ? "CASH" : "INVOICE_ACCRUAL";
}

export type PaymentTaxBreakdown = {
  grossAmount: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  parentVat: Prisma.Decimal;
  governmentBorneVat: Prisma.Decimal;
  totalVat: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  taxTreatment: string;
};

export function taxEventRecognitionStatus(
  basis: VatAccountingBasis,
  eventType: "INVOICE_ISSUED" | "PAYMENT_COLLECTED",
): TaxEventStatus {
  return basis === "INVOICE_ACCRUAL"
    ? eventType === "INVOICE_ISSUED" ? "RECOGNIZED" : "INFORMATIONAL"
    : eventType === "PAYMENT_COLLECTED" ? "RECOGNIZED" : "INFORMATIONAL";
}

/**
 * Splits a parent payment using the authoritative tax treatment stored on the
 * issued invoice/fee item. Currency arithmetic remains Decimal end-to-end.
 */
export function calculateInclusivePaymentTax(input: {
  grossAmount: Prisma.Decimal.Value;
  vatRate: Prisma.Decimal.Value;
  taxTreatment: string;
}): PaymentTaxBreakdown {
  const grossAmount = currency(input.grossAmount);
  const vatRate = D(input.vatRate);
  if (grossAmount.lte(0)) throw new ServiceError("Payment amount must be greater than zero.", 422, "INVALID_PAYMENT_AMOUNT");
  if (vatRate.lt(0) || vatRate.gt(100)) throw new ServiceError("VAT rate is outside the supported range.", 422, "VAT_CONFIGURATION_INVALID");
  const treatment = String(input.taxTreatment || "STANDARD").toUpperCase();
  if (treatment === "STANDARD" && vatRate.gt(0)) {
    const taxableAmount = currency(grossAmount.div(D(1).plus(vatRate.div(100))));
    const parentVat = currency(grossAmount.minus(taxableAmount));
    return { grossAmount, taxableAmount, parentVat, governmentBorneVat: D(0), totalVat: parentVat, vatRate, taxTreatment: treatment };
  }
  if (treatment === "GOVERNMENT_BORNE" && vatRate.gt(0)) {
    const governmentBorneVat = currency(grossAmount.mul(vatRate).div(100));
    return { grossAmount, taxableAmount: grossAmount, parentVat: D(0), governmentBorneVat, totalVat: governmentBorneVat, vatRate, taxTreatment: treatment };
  }
  return { grossAmount, taxableAmount: grossAmount, parentVat: D(0), governmentBorneVat: D(0), totalVat: D(0), vatRate: D(0), taxTreatment: treatment };
}

export async function ensureFeeAgreementUsing(tx: DatabaseClient, accountId: string, actor: Actor) {
  const existing = await tx.feeAgreement.findFirst({
    where: { accountId, status: "ISSUED" },
    include: { lines: true },
    orderBy: { issuedAt: "desc" },
  });
  if (existing) return existing;
  const account = await tx.financeAccount.findFirst({
    where: { id: accountId, deletedAt: null },
    include: {
      feeItems: true,
      registration: { include: { academicYear: true } },
      student: true,
      discounts: { where: { status: "APPROVED" } },
    },
  });
  if (!account) throw new ServiceError("Finance account not found.", 404, "FINANCE_ACCOUNT_NOT_FOUND");
  const baseFees = currency(account.feeItems.reduce((sum, row) => sum.plus(row.subtotal ?? row.amount), D(0)));
  const expectedVat = currency(account.feeItems.reduce((sum, row) => sum.plus(row.vatAmount ?? 0).plus(row.governmentBorneVat ?? 0), D(0)));
  const parentVat = currency(account.feeItems.reduce((sum, row) => sum.plus(row.vatAmount ?? 0), D(0)));
  const governmentBorneVat = currency(account.feeItems.reduce((sum, row) => sum.plus(row.governmentBorneVat ?? 0), D(0)));
  const discountAmount = currency(account.discounts.reduce((sum, row) => sum.plus(row.calculatedAmount), D(0)));
  const contractTotal = currency(baseFees.plus(parentVat).minus(discountAmount));
  const issuedAt = new Date();
  const agreementNumber = await nextFinanceDocumentNumber(tx, "FEE_AGREEMENT", issuedAt);
  return tx.feeAgreement.create({
    data: {
      id: randomUUID(), agreementNumber, accountId,
      academicYearId: account.registration.academicYearId,
      branchId: account.registration.branchId,
      baseFees, discountAmount, expectedVat, governmentBorneVat, parentVat, contractTotal,
      taxTreatment: account.feeItems.some((row) => row.taxTreatment === "STANDARD") ? "STANDARD" : account.feeItems[0]?.taxTreatment || "EXEMPT",
      createdById: actor.id,
      snapshot: {
        workflowVersion: 2,
        registrationNumber: account.registration.registrationNumber,
        studentId: account.studentId,
        note: "Contractual fee schedule; not a tax invoice and not a payment receipt.",
      },
      lines: {
        create: account.feeItems.map((row) => ({
          id: randomUUID(), feeItemId: row.id, description: row.name,
          serviceCategory: row.serviceCategory,
          baseAmount: row.subtotal ?? row.amount,
          vatRate: row.vatRate,
          expectedVat: D(row.vatAmount ?? 0).plus(row.governmentBorneVat ?? 0),
          governmentBorneVat: row.governmentBorneVat,
          parentPayable: row.amount,
          taxTreatment: row.taxTreatment,
        })),
      },
    },
    include: { lines: true },
  });
}

export async function recordInvoiceTaxEventUsing(tx: DatabaseClient, input: {
  invoice: { id: string; accountId: string; issuedAt: Date; subtotal: Prisma.Decimal.Value; vatAmount: Prisma.Decimal.Value; governmentBorneVat: Prisma.Decimal.Value; total: Prisma.Decimal.Value; taxTreatment: string; feeAgreementId?: string | null };
  actor: Actor;
  journalEntryId?: string | null;
}) {
  const basis = await vatAccountingBasisUsing(tx);
  // Government-borne VAT is not cash collected from the parent. Its tax event
  // is therefore the issued tax document, even when parent VAT uses cash basis.
  const status = D(input.invoice.governmentBorneVat).gt(0)
    ? "RECOGNIZED"
    : taxEventRecognitionStatus(basis, "INVOICE_ISSUED");
  return tx.taxEvent.create({
    data: {
      id: randomUUID(), eventNumber: `TE-${randomUUID()}`, accountId: input.invoice.accountId,
      feeAgreementId: input.invoice.feeAgreementId || null, invoiceId: input.invoice.id,
      journalEntryId: input.journalEntryId || null,
      accountingBasis: basis, eventType: "INVOICE_ISSUED", status,
      recognitionDate: input.invoice.issuedAt, taxableAmount: input.invoice.subtotal,
      parentVat: input.invoice.vatAmount, governmentBorneVat: input.invoice.governmentBorneVat,
      totalVat: D(input.invoice.vatAmount).plus(input.invoice.governmentBorneVat),
      grossAmount: input.invoice.total, taxTreatment: input.invoice.taxTreatment,
      createdById: input.actor.id,
      snapshot: { workflowVersion: 2, recognitionSource: status === "RECOGNIZED" ? "TAX_INVOICE" : "PAYMENT_REQUIRED" },
    },
  });
}

export async function issuePaymentReceiptUsing(tx: DatabaseClient, input: {
  payment: { id: string; accountId: string; amount: Prisma.Decimal.Value; paidAt: Date; method: string; referenceNumber?: string | null; receiptNumber?: string };
  feeAgreementId?: string | null;
  breakdown: PaymentTaxBreakdown;
  balanceBefore: Prisma.Decimal.Value;
  totalPaidBefore: Prisma.Decimal.Value;
  actor: Actor;
  allocations: unknown[];
  journalEntryId?: string | null;
}) {
  const issuedAt = input.payment.paidAt;
  const receiptNumber = input.payment.receiptNumber || await nextFinanceDocumentNumber(tx, "PAYMENT_RECEIPT", issuedAt);
  const totalPaidBefore = currency(input.totalPaidBefore);
  const amountReceived = currency(input.payment.amount);
  const receipt = await tx.paymentReceipt.create({
    data: {
      id: randomUUID(), receiptNumber, paymentId: input.payment.id, accountId: input.payment.accountId,
      feeAgreementId: input.feeAgreementId || null, amountReceived,
      netAmount: input.breakdown.taxableAmount, parentVat: input.breakdown.parentVat,
      governmentBorneVat: input.breakdown.governmentBorneVat,
      balanceBefore: currency(input.balanceBefore), balanceAfter: currency(D(input.balanceBefore).minus(amountReceived)),
      totalPaidBefore, totalPaidAfter: currency(totalPaidBefore.plus(amountReceived)),
      issuedAt, issuedById: input.actor.id,
      snapshot: {
        workflowVersion: 2, method: input.payment.method,
        referenceNumber: input.payment.referenceNumber || null,
        allocations: input.allocations as Prisma.InputJsonValue,
        statement: "Payment receipt only; receipt amount equals actual money received.",
      },
    },
  });
  const basis = await vatAccountingBasisUsing(tx);
  const governmentBorne = D(input.breakdown.governmentBorneVat).gt(0);
  const eventStatus = governmentBorne
    ? "INFORMATIONAL"
    : taxEventRecognitionStatus(basis, "PAYMENT_COLLECTED");
  const event = await tx.taxEvent.create({
    data: {
      id: randomUUID(), eventNumber: `TE-${randomUUID()}`, accountId: input.payment.accountId,
      feeAgreementId: input.feeAgreementId || null, paymentId: input.payment.id, receiptId: receipt.id,
      journalEntryId: input.journalEntryId || null,
      accountingBasis: basis, eventType: "PAYMENT_COLLECTED", status: eventStatus,
      recognitionDate: issuedAt, taxableAmount: input.breakdown.taxableAmount,
      parentVat: input.breakdown.parentVat,
      // Preserve the receipt display breakdown, but never recognize the same
      // government-borne VAT again from a parent's cash receipt.
      governmentBorneVat: governmentBorne ? D(0) : input.breakdown.governmentBorneVat,
      totalVat: governmentBorne ? input.breakdown.parentVat : input.breakdown.totalVat,
      grossAmount: amountReceived,
      taxTreatment: input.breakdown.taxTreatment, createdById: input.actor.id,
      snapshot: { workflowVersion: 2, recognitionSource: eventStatus === "RECOGNIZED" ? "PAYMENT" : "INVOICE_ALREADY_RECOGNIZED" },
    },
  });
  return { receipt, taxEvent: event };
}

/**
 * Reverses recognized tax events without deleting the original tax evidence.
 * The negative event is the VAT-reporting source and is linked to both the
 * original event and the accounting reversal journal.
 */
export async function reverseTaxEventsUsing(tx: DatabaseClient, input: {
  paymentId?: string;
  invoiceId?: string;
  eventType: "REFUND" | "VOID";
  recognitionDate: Date;
  reversalJournalEntryId: string;
  actor: Actor;
}) {
  const originals = await tx.taxEvent.findMany({
    where: {
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
      ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
      reversalOfId: null,
      eventType: input.paymentId ? "PAYMENT_COLLECTED" : "INVOICE_ISSUED",
      status: { in: ["RECOGNIZED", "INFORMATIONAL"] },
    },
  });
  const reversals = [];
  for (const original of originals) {
    const existing = await tx.taxEvent.findFirst({
      where: { reversalOfId: original.id, eventType: input.eventType },
    });
    if (existing) {
      reversals.push(existing);
      continue;
    }
    const reversal = await tx.taxEvent.create({
      data: {
        id: randomUUID(),
        eventNumber: `TE-${randomUUID()}`,
        accountId: original.accountId,
        feeAgreementId: original.feeAgreementId,
        invoiceId: input.invoiceId || null,
        paymentId: input.paymentId || null,
        receiptId: original.receiptId,
        accountingBasis: original.accountingBasis,
        eventType: input.eventType,
        status: original.status,
        recognitionDate: input.recognitionDate,
        taxableAmount: D(original.taxableAmount).negated(),
        parentVat: D(original.parentVat).negated(),
        governmentBorneVat: D(original.governmentBorneVat).negated(),
        totalVat: D(original.totalVat).negated(),
        grossAmount: D(original.grossAmount).negated(),
        taxTreatment: original.taxTreatment,
        journalEntryId: input.reversalJournalEntryId,
        reversalOfId: original.id,
        createdById: input.actor.id,
        snapshot: {
          workflowVersion: 2,
          reversalReason: input.eventType,
          originalEventNumber: original.eventNumber,
        },
      },
    });
    reversals.push(reversal);
  }
  return reversals;
}

export async function vatEventReportUsing(tx: DatabaseClient, filters: {
  from?: Date; to?: Date; branchId?: string; taxTreatment?: string;
}) {
  const events = await tx.taxEvent.findMany({
    where: {
      status: "RECOGNIZED",
      recognitionDate: { gte: filters.from, lte: filters.to },
      taxTreatment: filters.taxTreatment,
      account: filters.branchId ? { registration: { branchId: filters.branchId } } : undefined,
    },
    include: {
      invoice: { select: { invoiceNumber: true } },
      receipt: { select: { receiptNumber: true } },
      payment: { select: { id: true } },
    },
    orderBy: { recognitionDate: "asc" },
  });
  const summary = events.reduce((sum, row) => ({
    taxableSales: currency(sum.taxableSales.plus(
      ["ZERO_RATE", "EXEMPT", "NON_TAXABLE"].includes(row.taxTreatment) ? 0 : row.taxableAmount,
    )),
    outputVat: currency(sum.outputVat.plus(row.parentVat)),
    governmentBorneVat: currency(sum.governmentBorneVat.plus(row.governmentBorneVat)),
    zeroRated: currency(sum.zeroRated.plus(row.taxTreatment === "ZERO_RATE" ? row.taxableAmount : 0)),
    exempt: currency(sum.exempt.plus(row.taxTreatment === "EXEMPT" ? row.taxableAmount : 0)),
    adjustments: currency(sum.adjustments.plus(["REFUND", "VOID"].includes(row.eventType) ? row.totalVat : 0)),
    creditNotes: currency(sum.creditNotes.plus(row.eventType === "CREDIT_NOTE" ? row.totalVat : 0)),
    debitNotes: currency(sum.debitNotes.plus(row.eventType === "DEBIT_NOTE" ? row.totalVat : 0)),
  }), {
    taxableSales: D(0), outputVat: D(0), governmentBorneVat: D(0), zeroRated: D(0), exempt: D(0),
    adjustments: D(0), creditNotes: D(0), debitNotes: D(0),
  });
  return { basis: await vatAccountingBasisUsing(tx), summary, events };
}

import { Prisma, type PrismaClient } from "@prisma/client";
import { vatAccountingBasisUsing, vatEventReportUsing } from "./tuition-tax.service.js";

const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
const amount = (value: Prisma.Decimal.Value) => Number(D(value).toDecimalPlaces(2));

/**
 * VAT reporting is event-led for workflow v2 and ledger-led only for historical
 * rows that pre-date tax events. This prevents expected student fees from ever
 * becoming VAT liability and avoids counting the same v2 journal twice.
 */
export class VatService {
  constructor(private readonly prisma: PrismaClient) {}

  async summary(from?: string, to?: string, branchId?: string, taxTreatment?: string) {
    const period = {
      gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
      lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    };
    const eventReport = await vatEventReportUsing(this.prisma, {
      from: period.gte,
      to: period.lte,
      branchId,
      taxTreatment,
    });
    const versionTwoJournalIds = (
      await this.prisma.taxEvent.findMany({
        where: { journalEntryId: { not: null } },
        select: { journalEntryId: true },
      })
    ).map((row) => row.journalEntryId!).filter(Boolean);
    const allVatLines = await this.prisma.journalLine.findMany({
      where: {
        account: { isVatAccount: true },
        journalEntry: {
          status: { in: ["POSTED", "REVERSED"] },
          deletedAt: null,
          postingDate: period,
          branchId,
        },
      },
      include: {
        account: { select: { code: true, name: true, nameAr: true, systemKey: true } },
        journalEntry: { select: { id: true, entryNumber: true, postingDate: true, description: true } },
      },
      orderBy: [{ journalEntry: { postingDate: "asc" } }, { createdAt: "asc" }],
    });
    const legacyVatLines = allVatLines.filter((line) => !versionTwoJournalIds.includes(line.journalEntry.id));
    const historicalOutputVat = legacyVatLines.reduce((sum, line) => sum.plus(line.credit), D(0));
    const inputVat = allVatLines
      .filter((line) => line.account.systemKey === "vat-input")
      .reduce((sum, line) => sum.plus(line.debit).minus(line.credit), D(0));
    const recognizedOutputVat = D(eventReport.summary.outputVat).plus(eventReport.summary.governmentBorneVat);
    const outputVat = historicalOutputVat.plus(recognizedOutputVat);
    const vatPayable = outputVat.minus(inputVat);
    // Reconciliation must use the actually posted VAT-payable ledger balance;
    // deriving it from the report itself would hide posting differences.
    const vatGlBalance = allVatLines
      .filter((line) => line.account.systemKey === "vat-payable")
      .reduce((sum, line) => sum.plus(line.credit).minus(line.debit), D(0));

    return {
      basis: await vatAccountingBasisUsing(this.prisma),
      taxableSales: amount(eventReport.summary.taxableSales),
      outputVat: amount(outputVat),
      parentOutputVat: amount(eventReport.summary.outputVat),
      governmentBorneVat: amount(eventReport.summary.governmentBorneVat),
      historicalOutputVat: amount(historicalOutputVat),
      inputVat: amount(inputVat),
      vatPayable: amount(vatPayable),
      zeroRated: amount(eventReport.summary.zeroRated),
      exempt: amount(eventReport.summary.exempt),
      adjustments: amount(eventReport.summary.adjustments),
      creditNotes: amount(eventReport.summary.creditNotes),
      debitNotes: amount(eventReport.summary.debitNotes),
      vatGlBalance: amount(vatGlBalance),
      reconciliationDifference: amount(vatPayable.minus(vatGlBalance)),
      sourceDocuments: [
        ...eventReport.events.map((event: any) => ({
          date: event.recognitionDate,
          source: event.invoice?.invoiceNumber || event.receipt?.receiptNumber || event.eventNumber,
          sourceType: event.eventType,
          taxTreatment: event.taxTreatment,
          taxableAmount: amount(event.taxableAmount),
          parentVat: amount(event.parentVat),
          governmentBorneVat: amount(event.governmentBorneVat),
          totalVat: amount(event.totalVat),
          journalEntryId: event.journalEntryId,
          historical: false,
        })),
        ...legacyVatLines.map((line) => ({
          date: line.journalEntry.postingDate,
          source: line.journalEntry.entryNumber,
          sourceType: "HISTORICAL_GL",
          taxTreatment: "HISTORICAL_RECORDED",
          taxableAmount: 0,
          parentVat: amount(line.credit),
          governmentBorneVat: 0,
          totalVat: amount(D(line.credit).minus(line.debit)),
          journalEntryId: line.journalEntry.id,
          historical: true,
        })),
      ],
    };
  }
}

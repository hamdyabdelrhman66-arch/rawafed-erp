import type { PrismaClient } from "@prisma/client";
import { JournalsRepository } from "../repositories/journals.repository.js";
import { LedgerRepository } from "../repositories/ledger.repository.js";
import { FinancialStatementsService } from "./financial-statements.service.js";
import { VatService } from "./vat.service.js";

export class ReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}
  async report() {
    const journals = new JournalsRepository(this.prisma),
      ledger = new LedgerRepository(this.prisma),
      statements = new FinancialStatementsService(this.prisma);
    const [
      unbalancedJournalEntries,
      duplicateSourcePostings,
      invoicesWithoutJournals,
      paymentsWithoutJournals,
      trialBalance,
      balanceSheet,
      dashboard,
      vat,
    ] = await Promise.all([
      journals.unbalanced(),
      journals.duplicateSources(),
      ledger.invoicesWithoutJournals(),
      ledger.paymentsWithoutJournals(),
      statements.trialBalance(),
      statements.balanceSheet(),
      statements.dashboard(),
      new VatService(this.prisma).summary(),
    ]);
    const receivableLedger = (await ledger.lines({ accountTypes: ["ASSET"] }))
      .filter((l) => l.account.isReceivableAccount)
      .reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0);
    const openInvoices = await this.prisma.financeInvoice.findMany({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      include: { payments: true },
    });
    const receivableInvoices = openInvoices.reduce(
      (n, i) =>
        n +
        Number(i.total) -
        i.payments.reduce((s, p) => s + Number(p.amount), 0),
      0,
    );
    return {
      generatedAt: new Date().toISOString(),
      correctionMode: "report-only",
      unbalancedJournalEntries,
      duplicateSourcePostings,
      invoicesWithoutJournals,
      paymentsWithoutJournals,
      expensesWithoutJournals: [],
      receivablesMismatch: {
        ledger: receivableLedger,
        invoices: receivableInvoices,
        difference: receivableLedger - receivableInvoices,
      },
      payablesMismatch: null,
      vatMismatch: { ledger: vat.vatPayable },
      cashMismatch: null,
      dashboardMismatch: !dashboard.trialBalance.balanced,
      trialBalanceMismatch: !trialBalance.balanced,
      balanceSheetMismatch: !balanceSheet.balanced,
    };
  }
}

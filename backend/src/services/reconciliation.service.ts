import { Prisma, type PrismaClient } from "@prisma/client";
import { JournalsRepository } from "../repositories/journals.repository.js";
import { LedgerRepository } from "../repositories/ledger.repository.js";
import { FinancialStatementsService } from "./financial-statements.service.js";
import { VatService } from "./vat.service.js";

export class ReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}
  async report() {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.buildReport();
      } catch (error: any) {
        lastError = error;
        const transient =
          ["P1001", "P1002", "P2024"].includes(String(error?.code || "")) ||
          /can't reach database|connection|timed out/i.test(
            String(error?.message || ""),
          );
        if (!transient || attempt === 2) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * (attempt + 1)),
        );
        await this.prisma.$connect().catch(() => undefined);
      }
    }
    throw lastError;
  }
  private async buildReport() {
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
      duplicateInvoiceGroups,
      duplicateNotifications,
      invalidAccountHierarchy,
      studentsWithoutFinanceAccounts,
    ] = await Promise.all([
      journals.unbalanced(),
      journals.duplicateSources(),
      ledger.invoicesWithoutJournals(),
      ledger.paymentsWithoutJournals(),
      statements.trialBalance(),
      statements.balanceSheet(),
      statements.dashboard(),
      new VatService(this.prisma).summary(),
      this.prisma.$queryRaw<
        Array<{
          account_id: string;
          total: Prisma.Decimal;
          invoice_date: Date;
          count: bigint;
        }>
      >`SELECT account_id, total, DATE(issued_at) invoice_date, COUNT(*) count
         FROM finance_invoices
        WHERE deleted_at IS NULL AND status <> 'VOID'
        GROUP BY account_id, total, DATE(issued_at)
       HAVING COUNT(*) > 1`,
      this.prisma.$queryRaw<
        Array<{
          source_type: string;
          source_id: string;
          event_type: string;
          target_role: string;
          count: bigint;
        }>
      >`SELECT source_type, source_id, event_type, target_role, COUNT(*) count
         FROM notifications
        WHERE deleted_at IS NULL AND source_type IS NOT NULL
        GROUP BY source_type, source_id, event_type, target_role
       HAVING COUNT(*) > 1`,
      this.prisma.$queryRaw<
        Array<{ id: string; code: string; reason: string }>
      >`
        SELECT child.id, child.code,
               CASE WHEN child.parent_id = child.id THEN 'self-parent'
                    WHEN child.type <> parent.type THEN 'cross-type-parent' END reason
          FROM chart_of_accounts child
          JOIN chart_of_accounts parent ON parent.id = child.parent_id
         WHERE child.deleted_at IS NULL
           AND (child.parent_id = child.id OR child.type <> parent.type)`,
      this.prisma.student.findMany({
        where: { deletedAt: null, financeAccount: null },
        select: { id: true, registrationNumber: true, englishName: true },
      }),
    ]);
    const receivableLedger = (await ledger.lines({ accountTypes: ["ASSET"] }))
      .filter((l) => l.account.isReceivableAccount)
      .reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0);
    const openInvoices = await this.prisma.financeInvoice.findMany({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      include: {
        payments: {
          where: { payment: { status: "COMPLETED", deletedAt: null } },
        },
      },
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
      duplicateInvoiceGroups,
      duplicateNotifications,
      invalidAccountHierarchy,
      studentsWithoutFinanceAccounts,
    };
  }
}

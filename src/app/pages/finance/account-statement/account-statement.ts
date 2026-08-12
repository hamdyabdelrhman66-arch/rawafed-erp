import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AccountingAccount, AccountingService } from '../../../core/finance/accounting.service';
import { formatAccountingBalance } from '../../../core/finance/accounting-balance';
import { I18nService } from '../../../core/i18n/i18n.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-account-statement',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './account-statement.html',
  styleUrl: './account-statement.css',
})
export class AccountStatement implements OnInit {
  accounts: AccountingAccount[] = [];
  selectedAccountIds: string[] = [];
  statement: any;
  details: any;
  loading = false;
  filters = {
    fromDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    accountType: '', branch: '', search: '', sortBy: 'code', sortDirection: 'asc',
  };

  constructor(
    private readonly accounting: AccountingService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    public readonly i18n: I18nService,
    private readonly feedback: FeedbackService,
    private readonly exports: ReportExportService,
    private readonly auth: AuthService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.accounts = await this.accounting.getAccounts();
    const params = this.route.snapshot.queryParamMap;
    const accountIds = (params.get('accountIds') || params.get('accountId') || '').split(',').filter(Boolean);
    this.selectedAccountIds = accountIds.filter((id) => this.accounts.some((account) => account.id === id));
    for (const key of ['fromDate', 'toDate', 'accountType', 'branch', 'search', 'sortBy', 'sortDirection'] as const) {
      const value = params.get(key);
      if (value !== null) this.filters[key] = value;
    }
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.details = null;
    try {
      await this.router.navigate([], {
        relativeTo: this.route,
        replaceUrl: true,
        queryParams: {
          ...this.filters,
          accountIds: this.selectedAccountIds.length ? this.selectedAccountIds.join(',') : null,
          accountId: null,
        },
        queryParamsHandling: 'merge',
      });
      this.statement = await this.accounting.getAccountStatement({ ...this.filters, accountIds: this.selectedAccountIds });
    } catch (error) {
      this.feedback.error('تعذر تحميل كشف الحساب.', safeErrorMessage(error));
    } finally {
      this.loading = false;
    }
  }

  toggleAccount(id: string, checked: boolean): void {
    this.selectedAccountIds = checked
      ? [...new Set([...this.selectedAccountIds, id])]
      : this.selectedAccountIds.filter((value) => value !== id);
  }

  async drillDown(row: any): Promise<void> {
    this.details = await this.accounting.getLedger(row.accountId, this.filters.fromDate, this.filters.toDate);
  }

  balance(value: unknown): string {
    return formatAccountingBalance(value, this.i18n.language());
  }

  money(value: unknown): string {
    return this.i18n.money(Number(value || 0));
  }

  async exportExcel(): Promise<void> { await this.exports.downloadExcel(this.report()); }
  async exportPdf(): Promise<void> { await this.exports.downloadPdf(this.report()); }
  async print(): Promise<void> { await this.exports.printPdf(this.report()); }

  private report(): ReportTable {
    const ar = this.i18n.language() === 'ar';
    const rows = this.statement?.rows || [];
    return {
      title: 'Account Statement', titleAr: 'كشف الحساب',
      subtitle: `${this.filters.fromDate} — ${this.filters.toDate}`,
      columns: ar
        ? ['الكود', 'الحساب', 'الرصيد الافتتاحي', 'مدين الفترة', 'دائن الفترة', 'الرصيد الختامي', 'عدد الحركات']
        : ['Code', 'Account', 'Opening balance', 'Period debit', 'Period credit', 'Closing balance', 'Transactions'],
      rows: rows.map((row: any) => [row.code, ar ? row.nameAr || row.nameEn : row.nameEn, this.balance(row.openingBalance), row.periodDebit, row.periodCredit, this.balance(row.closingBalance), row.transactionCount]),
      summary: [
        { label: ar ? 'عدد الحسابات' : 'Accounts', value: this.statement?.summary?.accountCount || 0 },
        { label: ar ? 'إجمالي مدين الفترة' : 'Period debit', value: this.statement?.summary?.periodDebit || 0 },
        { label: ar ? 'إجمالي دائن الفترة' : 'Period credit', value: this.statement?.summary?.periodCredit || 0 },
      ],
      fileName: `rawafed-account-statement-${this.filters.fromDate}-${this.filters.toDate}`,
      direction: ar ? 'rtl' : 'ltr', locale: ar ? 'ar' : 'en',
      generatedBy: this.auth.session()?.displayName || 'Rawafed ERP',
    };
  }
}

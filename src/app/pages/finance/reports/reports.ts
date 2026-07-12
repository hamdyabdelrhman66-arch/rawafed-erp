import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AccountingService } from '../../../core/finance/accounting.service';
import { ExpensesService } from '../../../core/finance/expenses.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
import { PaymentsService } from '../../../core/finance/payments.service';
import { StaffService } from '../../../core/finance/staff.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';
import { StorageService } from '../../../core/services/storage.service';

type ReportKind = 'finance-summary' | 'income-statement' | 'financial-position' | 'cash-flow' | 'equity-changes' | 'all-accounts-statement' | 'account-ledger' | 'payments' | 'expenses' | 'expense-by-category' | 'expense-by-supplier' | 'vat-input' | 'cash-expenses' | 'bank-expenses' | 'unpaid-expenses' | 'cost-center-expenses' | 'payroll' | 'outstanding' | 'admissions';

interface AccountOption {
  value: string;
  label: string;
  type: 'revenue' | 'expense';
  match: string[];
}

interface ExpenseDetail {
  supplierName?: string;
  supplierTaxNumber?: string;
  invoiceNumber?: string;
  method?: string;
}

interface ReportRow {
  date: string;
  search: string;
  values: Array<string | number>;
  amount?: number;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css', '../../../shared/finance/finance-ui.scss']
})
export class Reports implements OnInit {
  reportKind: ReportKind = 'finance-summary';
  selectedAccount = 'revenue-cash';
  fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  toDate = new Date().toISOString().slice(0, 10);
  searchText = '';

  payments: any[] = [];
  expenses: any[] = [];
  accounts: any[] = [];
  payroll: any[] = [];
  trialBalance: any;

  readonly reportOptions: Array<{ value: ReportKind; label: string }> = [
    { value: 'finance-summary', label: 'Finance Summary' },
    { value: 'income-statement', label: 'Income Statement' },
    { value: 'financial-position', label: 'Statement of Financial Position' },
    { value: 'cash-flow', label: 'Cash Flow Statement' },
    { value: 'equity-changes', label: 'Statement of Changes in Equity' },
    { value: 'all-accounts-statement', label: 'All Accounts Statement' },
    { value: 'account-ledger', label: 'Account Ledger / Trial Balance' },
    { value: 'payments', label: 'Payments Report' },
    { value: 'expenses', label: 'Expenses Report' },
    { value: 'expense-by-category', label: 'Expense by Category' },
    { value: 'expense-by-supplier', label: 'Expense by Supplier' },
    { value: 'vat-input', label: 'VAT Input Report' },
    { value: 'cash-expenses', label: 'Cash Expenses Report' },
    { value: 'bank-expenses', label: 'Bank Expenses Report' },
    { value: 'unpaid-expenses', label: 'Unpaid Expenses' },
    { value: 'cost-center-expenses', label: 'Cost Center Expense Report' },
    { value: 'payroll', label: 'Payroll Report' },
    { value: 'outstanding', label: 'Outstanding Balances' },
    { value: 'admissions', label: 'Admissions Finance Report' }
  ];

  readonly accountOptions: AccountOption[] = [
    { value: 'revenue-cash', label: 'Cash Revenue', type: 'revenue', match: ['cash'] },
    { value: 'revenue-bank', label: 'Bank / Card Revenue', type: 'revenue', match: ['bank transfer', 'card', 'bank', 'transfer'] },
    { value: 'revenue-registration', label: 'Registration Fee Revenue', type: 'revenue', match: ['registration'] },
    { value: 'revenue-tuition', label: 'Tuition Revenue', type: 'revenue', match: ['tuition', 'school fees'] },
    { value: 'revenue-books', label: 'Books Revenue', type: 'revenue', match: ['book'] },
    { value: 'revenue-bus', label: 'Bus Revenue', type: 'revenue', match: ['bus', 'transport'] },
    { value: 'revenue-uniform', label: 'Uniform Revenue', type: 'revenue', match: ['uniform'] },
    { value: 'revenue-activities', label: 'Activities Revenue', type: 'revenue', match: ['activit'] },
    { value: 'expense-purchases', label: 'Purchases / Expenses', type: 'expense', match: ['purchase', 'tax purchase invoice', 'non-tax purchase', 'supplies', 'maintenance', 'other'] },
    { value: 'expense-salaries', label: 'Salaries Expense', type: 'expense', match: ['salary', 'salaries', 'payroll'] },
    { value: 'expense-rent', label: 'Rent Expense', type: 'expense', match: ['rent'] },
    { value: 'expense-utilities', label: 'Utilities Expense', type: 'expense', match: ['utilities', 'electricity', 'water', 'internet'] },
    { value: 'expense-marketing', label: 'Marketing Expense', type: 'expense', match: ['marketing'] }
  ];

  constructor(
    private readonly accounting: AccountingService,
    private readonly paymentsService: PaymentsService,
    private readonly expensesService: ExpensesService,
    private readonly accountService: PatientPackagesService,
    private readonly staffService: StaffService,
    private readonly storage: StorageService,
    private readonly exporter: ReportExportService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const report = params.get('report') as ReportKind | null;
      if (report && this.reportOptions.some((option) => option.value === report)) {
        this.reportKind = report;
      } else {
        this.reportKind = 'finance-summary';
      }
    });

    forkJoin({
      payments: this.paymentsService.getPayments(),
      expenses: this.expensesService.getExpenses(),
      accounts: this.accountService.getPackages(),
      payroll: this.staffService.getStaff()
    }).subscribe(({ payments, expenses, accounts, payroll }) => {
      this.payments = payments;
      this.expenses = expenses;
      this.accounts = accounts;
      this.payroll = payroll;
      void this.refreshAccountingReport();
    });
  }

  setReportKind(kind: ReportKind): void {
    this.reportKind = kind;
    if (this.isAccountingReport(kind)) void this.refreshAccountingReport();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: kind === 'finance-summary' ? {} : { report: kind },
      queryParamsHandling: 'replace'
    });
  }

  get reportTitle(): string {
    return this.reportOptions.find((item) => item.value === this.reportKind)?.label || 'Finance Report';
  }

  get reportSubtitle(): string {
    const account = this.reportKind === 'account-ledger' ? ` - ${this.selectedAccountLabel}` : '';
    return `${this.fromDate || 'Start'} to ${this.toDate || 'Today'}${account}`;
  }

  get selectedAccountLabel(): string {
    return this.accountOptions.find((item) => item.value === this.selectedAccount)?.label || 'Account';
  }

  get columns(): string[] {
    return {
      'finance-summary': ['Section', 'Count', 'Expected', 'Paid', 'Remaining'],
      'income-statement': ['Account', 'Type', 'Revenue', 'Expense', 'Net'],
      'financial-position': ['Account', 'Type', 'Debit Balance', 'Credit Balance', 'Closing'],
      'cash-flow': ['Cash / Bank Account', 'Opening', 'Cash In', 'Cash Out', 'Closing'],
      'equity-changes': ['Equity Account', 'Opening', 'Increase', 'Decrease', 'Closing'],
      'all-accounts-statement': ['Code', 'Account', 'Type', 'Opening', 'Debit', 'Credit', 'Closing'],
      'account-ledger': ['Date', 'Account', 'Description', 'Source', 'Method', 'Debit', 'Credit', 'Balance'],
      payments: ['Date', 'Student', 'Fee Item', 'Method', 'Receipt', 'Amount'],
      expenses: ['Date', 'Supplier', 'Category', 'Invoice Type', 'Payment Status', 'Total', 'Journal'],
      'expense-by-category': ['Category', 'Transactions', 'Amount Before VAT', 'VAT', 'Total'],
      'expense-by-supplier': ['Supplier', 'Transactions', 'Amount Before VAT', 'VAT', 'Total'],
      'vat-input': ['Date', 'Supplier', 'Invoice', 'Invoice Type', 'Amount Before VAT', 'Input VAT', 'Total'],
      'cash-expenses': ['Date', 'Supplier', 'Category', 'Payment From', 'Total', 'Journal'],
      'bank-expenses': ['Date', 'Supplier', 'Category', 'Payment From', 'Total', 'Journal'],
      'unpaid-expenses': ['Date', 'Supplier', 'Category', 'Invoice', 'Total', 'Journal'],
      'cost-center-expenses': ['Cost Center', 'Transactions', 'Amount Before VAT', 'VAT', 'Total'],
      payroll: ['Staff', 'Position', 'Start Date', 'Salary', 'Status'],
      outstanding: ['Student', 'Registration', 'Grade', 'Expected', 'Paid', 'Remaining', 'Status'],
      admissions: ['Submitted', 'Student', 'Grade', 'Registration', 'Parent Phone', 'Expected', 'Payment Status']
    }[this.reportKind];
  }

  get rows(): ReportRow[] {
    const rows = this.buildRows();
    const query = this.searchText.trim().toLowerCase();
    return rows.filter((row) => this.inDateRange(row.date) && (!query || row.search.includes(query)));
  }

  get tableRows(): Array<Array<string | number>> {
    return this.rows.map((row) => row.values);
  }

  get totalAmount(): number {
    return this.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }

  get totalRevenue(): number {
    return this.payments.filter((item) => this.inDateRange(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  get totalExpenses(): number {
    return this.expenses.filter((item) => this.inDateRange(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  get expectedTotal(): number {
    return this.accounts.reduce((sum, item) => sum + Number(item.total || 0), 0);
  }

  get paidTotal(): number {
    return this.accounts.reduce((sum, item) => sum + Number(item.paid || 0), 0);
  }

  get remainingTotal(): number {
    return this.accounts.reduce((sum, item) => sum + Number(item.remaining || 0), 0);
  }

  get admissionsInPeriod(): number {
    return this.storage.registrations().filter((item) => this.inDateRange(item.submittedAt || item.createdAt)).length;
  }

  get unpaidAdmissions(): number {
    return this.storage.registrations().filter((item) => Number(item.financial.grandTotal || 0) > 0 && item.financial.paymentStatus !== 'Paid').length;
  }

  async downloadPdf(): Promise<void> {
    await this.exporter.downloadPdf(this.currentReport());
  }

  downloadExcel(): void {
    this.exporter.downloadExcel(this.currentReport());
  }

  private currentReport(): ReportTable {
    return {
      title: this.reportTitle,
      subtitle: this.reportSubtitle,
      columns: this.columns,
      rows: this.tableRows,
      summary: [
        { label: 'Rows', value: this.rows.length },
        { label: 'Report Amount', value: this.money(this.totalAmount) },
        { label: 'Collections', value: this.money(this.totalRevenue) },
        { label: 'Expenses', value: this.money(this.totalExpenses) },
        { label: 'Outstanding', value: this.money(this.remainingTotal) },
        { label: 'Admissions', value: this.admissionsInPeriod }
      ],
      fileName: `rawafed-${this.reportKind}-${this.fromDate}-to-${this.toDate}`
    };
  }

  private buildRows(): ReportRow[] {
    if (this.reportKind === 'payments') return this.paymentRows();
    if (this.isAccountingReport(this.reportKind)) return this.accountingStatementRows();
    if (this.reportKind === 'account-ledger') return this.accountLedgerRows();
    if (this.reportKind === 'expenses') return this.expenseRows();
    if (this.reportKind === 'expense-by-category') return this.groupExpenseRows('category');
    if (this.reportKind === 'expense-by-supplier') return this.groupExpenseRows('supplierName');
    if (this.reportKind === 'vat-input') return this.vatInputRows();
    if (this.reportKind === 'cash-expenses') return this.filteredExpenseRows((expense) => String(expense.paymentFrom || expense.paymentMethod || '').toLowerCase().includes('cash'));
    if (this.reportKind === 'bank-expenses') return this.filteredExpenseRows((expense) => /bank|rajhi|ahli|riyad|transfer|card|online/i.test(String(expense.paymentFrom || expense.paymentMethod || '')));
    if (this.reportKind === 'unpaid-expenses') return this.filteredExpenseRows((expense) => expense.paymentStatus === 'Unpaid');
    if (this.reportKind === 'cost-center-expenses') return this.groupExpenseRows('costCenter');
    if (this.reportKind === 'payroll') return this.payrollRows();
    if (this.reportKind === 'outstanding') return this.outstandingRows();
    if (this.reportKind === 'admissions') return this.admissionRows();
    return this.summaryRows();
  }

  private summaryRows(): ReportRow[] {
    const financeAccounts = this.accounts.length;
    return [
      {
        date: this.toDate,
        search: 'student finance accounts expected paid remaining',
        values: ['Student Finance Accounts', financeAccounts, this.money(this.expectedTotal), this.money(this.paidTotal), this.money(this.remainingTotal)],
        amount: this.expectedTotal
      },
      {
        date: this.toDate,
        search: 'payments collections revenue',
        values: ['Payments / Collections', this.payments.length, '-', this.money(this.totalRevenue), '-'],
        amount: this.totalRevenue
      },
      {
        date: this.toDate,
        search: 'expenses',
        values: ['Expenses', this.expenses.length, '-', this.money(this.totalExpenses), '-'],
        amount: this.totalExpenses
      },
      {
        date: this.toDate,
        search: 'admissions registrations unpaid incomplete',
        values: ['Admissions In Period', this.admissionsInPeriod, '-', '-', this.unpaidAdmissions],
        amount: this.admissionsInPeriod
      }
    ];
  }

  async refreshAccountingReport(): Promise<void> {
    this.trialBalance = await this.accounting.getTrialBalance({
      fromDate: this.fromDate,
      toDate: this.toDate,
      displayMode: 'balance',
      showParentAccounts: false,
      accountStatus: 'active'
    });
  }

  private isAccountingReport(kind: ReportKind): boolean {
    return ['income-statement', 'financial-position', 'cash-flow', 'equity-changes', 'all-accounts-statement'].includes(kind);
  }

  private accountingStatementRows(): ReportRow[] {
    const rows = this.trialBalance?.rows || [];
    if (this.reportKind === 'income-statement') {
      return rows
        .filter((row: any) => ['revenue', 'expense'].includes(row.type))
        .map((row: any) => {
          const revenue = row.type === 'revenue' ? Number(row.periodCredit || 0) : 0;
          const expense = row.type === 'expense' ? Number(row.periodDebit || 0) : 0;
          return {
            date: this.toDate,
            search: [row.code, row.nameEn, row.nameAr, row.type].join(' ').toLowerCase(),
            values: [`${row.code} - ${row.nameEn}`, row.type, revenue ? this.money(revenue) : '-', expense ? this.money(expense) : '-', this.money(revenue - expense)],
            amount: revenue - expense
          };
        });
    }
    if (this.reportKind === 'financial-position') {
      return rows
        .filter((row: any) => ['asset', 'liability', 'equity'].includes(row.type))
        .map((row: any) => ({
          date: this.toDate,
          search: [row.code, row.nameEn, row.nameAr, row.type].join(' ').toLowerCase(),
          values: [`${row.code} - ${row.nameEn}`, row.type, this.money(row.closingDebit), this.money(row.closingCredit), this.money(row.closingBalance)],
          amount: Number(row.closingDebit || 0) - Number(row.closingCredit || 0)
        }));
    }
    if (this.reportKind === 'cash-flow') {
      return rows
        .filter((row: any) => /cash|bank|card/i.test([row.code, row.nameEn, row.nameAr].join(' ')))
        .map((row: any) => ({
          date: this.toDate,
          search: [row.code, row.nameEn, row.nameAr].join(' ').toLowerCase(),
          values: [`${row.code} - ${row.nameEn}`, this.money(row.openingBalance), this.money(row.periodDebit), this.money(row.periodCredit), this.money(row.closingBalance)],
          amount: Number(row.closingBalance || 0)
        }));
    }
    if (this.reportKind === 'equity-changes') {
      return rows
        .filter((row: any) => row.type === 'equity')
        .map((row: any) => ({
          date: this.toDate,
          search: [row.code, row.nameEn, row.nameAr].join(' ').toLowerCase(),
          values: [`${row.code} - ${row.nameEn}`, this.money(row.openingBalance), this.money(row.periodCredit), this.money(row.periodDebit), this.money(row.closingBalance)],
          amount: Number(row.closingBalance || 0)
        }));
    }
    return rows.map((row: any) => ({
      date: this.toDate,
      search: [row.code, row.nameEn, row.nameAr, row.type].join(' ').toLowerCase(),
      values: [row.code, row.nameEn, row.type, this.money(row.openingBalance), this.money(row.periodDebit), this.money(row.periodCredit), this.money(row.closingBalance)],
      amount: Number(row.closingBalance || 0)
    }));
  }

  private paymentRows(): ReportRow[] {
    return this.payments.map((item) => ({
      date: item.date,
      search: [item.patient, item.feeItem, item.package, item.method, item.receipt].join(' ').toLowerCase(),
      values: [item.date, this.safeName(item.patient), item.feeItem || item.package, item.method, item.receipt, this.money(item.amount)],
      amount: Number(item.amount || 0)
    }));
  }

  private expenseRows(): ReportRow[] {
    return this.expenses.map((item) => ({
      date: item.date,
      search: [item.supplierName, item.category, item.invoiceType, item.paymentStatus, item.journalEntryNo, item.notes].join(' ').toLowerCase(),
      values: [item.date, item.supplierName || '-', item.category, item.invoiceType || '-', item.paymentStatus || item.status, this.money(item.totalAmount || item.amount), item.journalEntryNo || '-'],
      amount: Number(item.totalAmount || item.amount || 0)
    }));
  }

  private groupExpenseRows(key: 'category' | 'supplierName' | 'costCenter'): ReportRow[] {
    const groups = new Map<string, any[]>();
    this.expenses.forEach((expense) => {
      const label = String(expense[key] || (key === 'costCenter' ? 'No Cost Center' : 'Unknown'));
      groups.set(label, [...(groups.get(label) || []), expense]);
    });
    return Array.from(groups.entries()).map(([label, rows]) => {
      const beforeVat = rows.reduce((sum, expense) => sum + Number(expense.amountBeforeVat || expense.amount || 0), 0);
      const vat = rows.reduce((sum, expense) => sum + Number(expense.vatAmount || 0), 0);
      const total = rows.reduce((sum, expense) => sum + Number(expense.totalAmount || expense.amount || 0), 0);
      return {
        date: this.toDate,
        search: [label, ...rows.map((row) => [row.supplierName, row.category, row.costCenter].join(' '))].join(' ').toLowerCase(),
        values: [label, rows.length, this.money(beforeVat), this.money(vat), this.money(total)],
        amount: total
      };
    });
  }

  private vatInputRows(): ReportRow[] {
    return this.expenses.filter((expense) => Number(expense.vatAmount || 0) > 0).map((expense) => ({
      date: expense.date,
      search: [expense.supplierName, expense.supplierInvoiceNumber, expense.invoiceType, expense.category].join(' ').toLowerCase(),
      values: [expense.date, expense.supplierName || '-', expense.supplierInvoiceNumber || '-', expense.invoiceType, this.money(expense.amountBeforeVat), this.money(expense.vatAmount), this.money(expense.totalAmount)],
      amount: Number(expense.vatAmount || 0)
    }));
  }

  private filteredExpenseRows(predicate: (expense: any) => boolean): ReportRow[] {
    return this.expenses.filter(predicate).map((expense) => ({
      date: expense.date,
      search: [expense.supplierName, expense.category, expense.paymentFrom, expense.paymentStatus, expense.journalEntryNo].join(' ').toLowerCase(),
      values: [expense.date, expense.supplierName || '-', expense.category, expense.paymentFrom || expense.paymentMethod || '-', this.money(expense.totalAmount || expense.amount), expense.journalEntryNo || '-'],
      amount: Number(expense.totalAmount || expense.amount || 0)
    }));
  }

  private accountLedgerRows(): ReportRow[] {
    const account = this.accountOptions.find((item) => item.value === this.selectedAccount) || this.accountOptions[0];
    const entries: Array<{ date: string; description: string; source: string; method: string; debit: number; credit: number; search: string }> = [];

    if (account.type === 'revenue') {
      this.payments
        .filter((payment) => this.paymentMatchesAccount(payment, account))
        .forEach((payment) => entries.push({
          date: payment.date,
          description: `${this.safeName(payment.patient)} - ${payment.feeItem || payment.package || 'Payment'}`,
          source: payment.receipt || payment.registrationNumber || '-',
          method: payment.method || '-',
          debit: 0,
          credit: Number(payment.amount || 0),
          search: [account.label, payment.patient, payment.feeItem, payment.package, payment.method, payment.receipt, payment.registrationNumber].join(' ').toLowerCase()
        }));
    } else {
      this.expenses
        .filter((expense) => this.expenseMatchesAccount(expense, account))
        .forEach((expense) => {
          const detail = this.expenseDetail(expense);
          entries.push({
            date: expense.date,
            description: this.expenseTitle(expense),
            source: expense.supplierName || detail.supplierName || expense.category || '-',
            method: expense.paymentFrom || expense.paymentMethod || detail.method || '-',
            debit: Number(expense.totalAmount || expense.amount || 0),
            credit: 0,
            search: [account.label, expense.category, expense.title, expense.supplierName, detail.supplierName, detail.supplierTaxNumber, detail.invoiceNumber, expense.notes].join(' ').toLowerCase()
          });
        });
    }

    let balance = 0;
    return entries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => {
        balance += entry.credit - entry.debit;
        return {
          date: entry.date,
          search: entry.search,
          values: [
            entry.date,
            account.label,
            entry.description,
            entry.source,
            entry.method,
            entry.debit ? this.money(entry.debit) : '-',
            entry.credit ? this.money(entry.credit) : '-',
            this.money(balance)
          ],
          amount: entry.credit - entry.debit
        };
      });
  }

  private payrollRows(): ReportRow[] {
    return this.payroll.map((item) => ({
      date: item.startDate || this.toDate,
      search: [item.name, item.position, item.status].join(' ').toLowerCase(),
      values: [this.safeName(item.name), item.position, item.startDate || '-', this.money(item.salary || item.net), item.status],
      amount: Number(item.salary || item.net || 0)
    }));
  }

  private outstandingRows(): ReportRow[] {
    return this.accounts.filter((item) => Number(item.remaining || 0) > 0).map((item) => ({
      date: item.startDate || this.toDate,
      search: [item.patient, item.registrationNumber, item.grade, item.status].join(' ').toLowerCase(),
      values: [this.safeName(item.patient), item.registrationNumber || '-', item.grade || '-', this.money(item.total), this.money(item.paid), this.money(item.remaining), item.status],
      amount: Number(item.remaining || 0)
    }));
  }

  private admissionRows(): ReportRow[] {
    return this.storage.registrations().map((item) => ({
      date: item.submittedAt || item.createdAt,
      search: [item.student.englishName, item.student.arabicName, item.student.applyingGrade, item.registrationNumber, item.father.phone, item.mother.phone, item.financial.paymentStatus].join(' ').toLowerCase(),
      values: [
        (item.submittedAt || item.createdAt).slice(0, 10),
        this.safeName(item.student.englishName || item.student.arabicName || '-'),
        item.student.applyingGrade,
        item.registrationNumber || '-',
        item.father.phone || item.mother.phone || '-',
        this.money(item.financial.grandTotal),
        item.financial.paymentStatus
      ],
      amount: Number(item.financial.grandTotal || 0)
    }));
  }

  private inDateRange(value: string): boolean {
    if (!value) return true;
    const date = value.slice(0, 10);
    return (!this.fromDate || date >= this.fromDate) && (!this.toDate || date <= this.toDate);
  }

  private money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US')} SAR`;
  }

  private paymentMatchesAccount(payment: any, account: AccountOption): boolean {
    const method = String(payment.method || '').toLowerCase();
    const item = [payment.feeItem, payment.package].join(' ').toLowerCase();
    if (account.value === 'revenue-cash') return method === 'cash';
    if (account.value === 'revenue-bank') return ['bank transfer', 'card'].some((value) => method.includes(value));
    return account.match.some((value) => item.includes(value));
  }

  private expenseMatchesAccount(expense: any, account: AccountOption): boolean {
    const detail = this.expenseDetail(expense);
    const text = [expense.category, expense.title, detail.supplierName].join(' ').toLowerCase();
    return account.match.some((value) => text.includes(value));
  }

  private expenseTitle(expense: any): string {
    const detail = this.expenseDetail(expense);
    return [expense.title || expense.description || 'Expense', detail.invoiceNumber ? `Invoice ${detail.invoiceNumber}` : ''].filter(Boolean).join(' - ');
  }

  private expenseDetail(expense: any): ExpenseDetail {
    try {
      const value = JSON.parse(expense.notes || '{}');
      return typeof value === 'object' && value ? value : {};
    } catch {
      return {};
    }
  }

  private safeName(value: unknown): string {
    const text = String(value || '-').trim();
    return /[^\x20-\x7E]/.test(text) ? text.replace(/[^\x20-\x7E]/g, '?') : text;
  }
}

import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ExpensesService } from '../../../core/finance/expenses.service';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';
import { PaymentsService } from '../../../core/finance/payments.service';
import { StaffService } from '../../../core/finance/staff.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';
import { StorageService } from '../../../core/services/storage.service';

type ReportKind = 'finance-summary' | 'payments' | 'expenses' | 'payroll' | 'outstanding' | 'admissions';

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
  fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  toDate = new Date().toISOString().slice(0, 10);
  searchText = '';

  payments: any[] = [];
  expenses: any[] = [];
  accounts: any[] = [];
  payroll: any[] = [];

  readonly reportOptions: Array<{ value: ReportKind; label: string }> = [
    { value: 'finance-summary', label: 'Finance Summary' },
    { value: 'payments', label: 'Payments Report' },
    { value: 'expenses', label: 'Expenses Report' },
    { value: 'payroll', label: 'Payroll Report' },
    { value: 'outstanding', label: 'Outstanding Balances' },
    { value: 'admissions', label: 'Admissions Finance Report' }
  ];

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly expensesService: ExpensesService,
    private readonly accountService: PatientPackagesService,
    private readonly staffService: StaffService,
    private readonly storage: StorageService,
    private readonly exporter: ReportExportService
  ) {}

  ngOnInit(): void {
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
    });
  }

  get reportTitle(): string {
    return this.reportOptions.find((item) => item.value === this.reportKind)?.label || 'Finance Report';
  }

  get reportSubtitle(): string {
    return `${this.fromDate || 'Start'} to ${this.toDate || 'Today'}`;
  }

  get columns(): string[] {
    return {
      'finance-summary': ['Section', 'Count', 'Expected', 'Paid', 'Remaining'],
      payments: ['Date', 'Student', 'Fee Item', 'Method', 'Receipt', 'Amount'],
      expenses: ['Date', 'Category', 'Title', 'Status', 'Amount'],
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
    if (this.reportKind === 'expenses') return this.expenseRows();
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
      search: [item.category, item.title, item.status, item.notes].join(' ').toLowerCase(),
      values: [item.date, item.category, item.title, item.status, this.money(item.amount)],
      amount: Number(item.amount || 0)
    }));
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

  private safeName(value: unknown): string {
    const text = String(value || '-').trim();
    return /[^\x20-\x7E]/.test(text) ? text.replace(/[^\x20-\x7E]/g, '?') : text;
  }
}

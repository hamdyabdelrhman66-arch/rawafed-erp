import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExpensesService } from '../../../core/finance/expenses.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { AccountingService } from '../../../core/finance/accounting.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './expenses.html',
  styleUrls: ['./expenses.css', '../../../shared/finance/finance-ui.scss']
})
export class Expenses implements OnInit {
  expenses: any[] = [];
  searchText = '';
  fromDate = '';
  toDate = '';
  statusFilter = '';
  paymentAccounts:any[] = [];
  selectedExpense:any = null;
  paymentForm = { amount: 0, paymentDate: new Date().toISOString().slice(0,10), paymentAccountId: '', paymentMethod: 'Bank Transfer', referenceNumber: '' };

  totalExpenses = 0;
  paidExpenses = 0;
  unpaidExpenses = 0;
  vatTotal = 0;

  constructor(private readonly expensesService: ExpensesService, private readonly accounting: AccountingService, public readonly i18n: I18nService, private readonly feedback: FeedbackService, private readonly reportExport: ReportExportService) {}

  ngOnInit(): void {
    this.expensesService.getExpenses().subscribe((expenses: any[]) => {
      this.expenses = expenses;
      this.totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.totalAmount ?? expense.amount ?? 0), 0);
      this.paidExpenses = expenses
        .filter((expense) => expense.paymentStatus === 'Paid' || expense.status === 'Paid')
        .reduce((sum, expense) => sum + Number(expense.totalAmount ?? expense.amount ?? 0), 0);
      this.unpaidExpenses = expenses
        .filter((expense) => expense.paymentStatus === 'Unpaid' || expense.status === 'Unpaid')
        .reduce((sum, expense) => sum + Number(expense.totalAmount ?? expense.amount ?? 0), 0);
      this.vatTotal = expenses.reduce((sum, expense) => sum + Number(expense.vatAmount || 0), 0);
    });
    void this.accounting.getPaymentAccounts().then((accounts) => this.paymentAccounts = accounts);
  }

  get filteredExpenses(): any[] {
    const query = this.searchText.trim().toLowerCase();
    return this.expenses.filter((expense) =>
      (!query ||
      [
        expense.expenseNo,
        expense.no,
        expense.supplierName,
        expense.category,
        expense.invoiceType,
        expense.paymentStatus,
        expense.paymentFrom,
        expense.journalEntryNo
      ].join(' ').toLowerCase().includes(query)) &&
      (!this.fromDate || String(expense.date) >= this.fromDate) &&
      (!this.toDate || String(expense.date) <= this.toDate) &&
      (!this.statusFilter || expense.paymentStatus === this.statusFilter)
    );
  }

  money(value: unknown): string {
    return this.i18n.money(Number(value || 0));
  }

  beginPayment(expense:any): void {
    this.selectedExpense = expense;
    this.paymentForm = { ...this.paymentForm, amount: Number(expense.remaining || 0), paymentAccountId: this.paymentAccounts[0]?.id || '' };
  }

  recordPayment(): void {
    if (!this.selectedExpense?.backendId || !this.paymentForm.paymentAccountId) return;
    this.expensesService.payExpense(this.selectedExpense.backendId, {
      ...this.paymentForm,
      idempotencyKey: `expense:${this.selectedExpense.backendId}:${this.paymentForm.referenceNumber || this.paymentForm.paymentDate}:${this.paymentForm.amount}`,
    }).subscribe({ next: () => { this.feedback.success(this.i18n.t('expense.payment_saved')); this.selectedExpense = null; this.ngOnInit(); }, error: (error) => this.feedback.error(this.i18n.t('expense.payment_failed'), safeErrorMessage(error)) });
  }

  async printReport(): Promise<void> { await this.reportExport.printPdf(this.expenseReport()); }

  private expenseReport(): ReportTable {
    return {
      title: 'Expense Register',
      titleAr: 'سجل المصروفات',
      subtitle: this.fromDate || this.toDate ? `${this.fromDate || '—'} - ${this.toDate || '—'}` : 'جميع الفترات',
      description: 'تقرير المصروفات والمدفوعات من قاعدة البيانات',
      columns: ['رقم المصروف', 'التاريخ', 'المورد', 'الوصف', 'قبل الضريبة', 'الضريبة', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'],
      rows: this.filteredExpenses.map((expense) => [expense.expenseNo || expense.no, expense.date, expense.supplierName || 'غير مسجل', expense.title || expense.category || '', Number(expense.amountBeforeVat || 0), Number(expense.vatAmount || 0), Number(expense.totalAmount ?? expense.amount ?? 0), Number(expense.paidAmount || 0), Number(expense.remaining || 0), this.i18n.status(expense.paymentStatus || expense.status)]),
      summary: [{ label: 'إجمالي المصروفات', value: this.money(this.totalExpenses) }, { label: 'المدفوع', value: this.money(this.paidExpenses) }, { label: 'غير المدفوع', value: this.money(this.unpaidExpenses) }, { label: 'ضريبة المدخلات', value: this.money(this.vatTotal) }],
      chart: { labels: ['المدفوع', 'غير المدفوع', 'ضريبة المدخلات'], values: [this.paidExpenses, this.unpaidExpenses, this.vatTotal] },
      fileName: `rawafed-expenses-${this.fromDate || 'all'}-${this.toDate || 'all'}`,
      direction: 'rtl',
      locale: 'ar',
    };
  }
}

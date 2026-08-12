import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';

@Component({
  selector: 'app-customer-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './customer-profile.html',
  styleUrls: ['./customer-profile.css', '../../../shared/finance/finance-ui.scss']
})
export class CustomerProfile implements OnInit {
  customer: any;
  statement: any;
  installments: any = { plans: [], installments: [] };
  feeAgreements: any[] = [];
  tab = 'overview';
  planForm = {
    planType: 'CUSTOM',
    calculationMode: 'FIXED',
    name: '',
    totalAmount: 0,
    startDate: new Date().toISOString().slice(0, 10),
    installmentsCount: 10,
    lateFeeType: 'fixed',
    lateFeeValue: 0,
    gracePeriodDays: 0,
    reminderDays: '7,3,1,0',
    allowDuplicateDueDates: false,
    autoCalculateFinal: true,
    installments: [] as Array<{ dueDate: string; amount: number; percentage?: number; notes?: string }>,
    notes: ''
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly accounting: AccountingService,
    public readonly i18n: I18nService,
    private readonly feedback: FeedbackService,
    private readonly reportExport: ReportExportService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab && ['overview', 'statement', 'invoices', 'payments', 'installments'].includes(requestedTab)) {
      this.tab = requestedTab;
    }
  }

  async load(): Promise<void> {
    const id = String(this.route.snapshot.paramMap.get('id'));
    [this.customer, this.statement, this.installments] = await Promise.all([
      this.accounting.getCustomer(id),
      this.accounting.getCustomerStatement(id),
      this.accounting.getCustomerInstallments(id)
    ]);
    this.feeAgreements = this.customer?.financeAccountId
      ? await this.accounting.getFeeAgreements(this.customer.financeAccountId)
      : [];
    this.planForm.totalAmount = Number(this.customer?.summary?.outstanding || 0);
    this.buildInstallments();
  }

  async savePlan(): Promise<void> {
    try {
      await this.accounting.createCustomerInstallmentPlan(this.customer.id, {
        ...this.planForm,
        installments: this.planForm.installments.map((item) => this.planForm.calculationMode === 'PERCENTAGE'
          ? { dueDate: item.dueDate, percentage: item.percentage, notes: item.notes }
          : { dueDate: item.dueDate, amount: item.amount, notes: item.notes }),
        reminderDays: this.planForm.reminderDays.split(',').map(Number).filter(Number.isFinite),
      });
      this.installments = await this.accounting.getCustomerInstallments(this.customer.id);
      this.tab = 'installments';
      this.feedback.success(this.i18n.t('installment.saved'));
    } catch (error) {
      this.feedback.error(this.i18n.t('installment.save_failed'), safeErrorMessage(error));
    }
  }

  buildInstallments(): void {
    const count = this.planForm.planType === 'FULL' ? 1 : this.planForm.planType === 'FIFTY_FIFTY' ? 2 : Math.max(1, Number(this.planForm.installmentsCount || 1));
    this.planForm.installmentsCount = count;
    const total = Number(this.planForm.totalAmount || 0);
    const each = Math.floor(total * 100 / count) / 100;
    let assigned = 0;
    this.planForm.installments = Array.from({ length: count }, (_, index) => {
      const due = new Date(this.planForm.startDate);
      due.setMonth(due.getMonth() + index);
      const amount = index === count - 1 ? Math.round((total - assigned) * 100) / 100 : each;
      assigned += amount;
      return { dueDate: due.toISOString().slice(0, 10), amount, percentage: total ? Math.round(amount / total * 10000) / 100 : 0, notes: '' };
    });
  }

  async printStatement(): Promise<void> {
    await this.reportExport.printPdf(this.statementReport());
  }

  async printFeeAgreement(): Promise<void> {
    const agreement = this.feeAgreements[0];
    if (!agreement) {
      this.feedback.error(this.i18n.language() === 'ar' ? 'لا يوجد بيان رسوم صادر لهذا الطالب.' : 'No issued fee agreement exists for this student.');
      return;
    }
    const feeRows = (agreement.lines || []).map((line: any) => [
      'بند رسوم', line.description, Number(line.baseAmount), Number(line.discountAmount),
      Number(line.expectedVat), Number(line.governmentBorneVat), Number(line.parentPayable),
    ]);
    const installmentRows = (agreement.installments || []).map((item: any, index: number) => [
      `القسط ${index + 1}`,
      `${String(item.dueDate || '').slice(0, 10)} · ${this.i18n.status(item.status)}`,
      Number(item.baseAmount || 0),
      Number(item.paidAmount || 0),
      Number(item.vatAmount || 0),
      0,
      Number(item.grossAmount || item.amount || 0),
    ]);
    await this.reportExport.printPdf({
      title: 'Tuition Fee Agreement / Fee Schedule',
      titleAr: 'بيان الرسوم الدراسية',
      subtitle: `${this.customer?.nameAr || this.customer?.nameEn || ''} · ${this.customer?.registrationNumber || ''}`,
      description: `${this.i18n.language() === 'ar' ? 'السنة الدراسية' : 'Academic year'}: ${agreement.academicYearId || '—'} · ${this.i18n.language() === 'ar' ? 'هذا المستند ليس سند قبض أو فاتورة ضريبية.' : 'This document is not a payment receipt or tax invoice.'}`,
      columns: ['القسم', 'البند / تاريخ الاستحقاق', 'المبلغ الأساسي', 'الخصم / المدفوع', 'الضريبة', 'ضريبة تتحملها الدولة', 'الإجمالي'],
      rows: [...feeRows, ...installmentRows],
      summary: [
        { label: 'إجمالي الرسوم الأساسية', value: this.money(agreement.baseFees) },
        { label: 'إجمالي الخصومات', value: this.money(agreement.discountAmount) },
        { label: 'الضريبة المتوقعة', value: this.money(Number(agreement.parentVat || 0) + Number(agreement.governmentBorneVat || 0)) },
        { label: 'إجمالي العقد', value: this.money(agreement.contractTotal) },
      ],
      fileName: `fee-agreement-${agreement.agreementNumber}`,
      direction: 'rtl',
      locale: 'ar',
    });
  }

  private statementReport(): ReportTable {
    const transactions = this.statement?.transactions || [];
    return {
      title: 'Student Account Statement',
      titleAr: 'كشف حساب الطالب',
      subtitle: this.i18n.language() === 'ar' ? (this.customer?.nameAr || this.customer?.nameEn || '') : (this.customer?.nameEn || this.customer?.nameAr || ''),
      description: `${this.customer?.registrationNumber || ''} · ${this.customer?.grade || ''}`,
      columns: ['التاريخ', 'القيد', 'المرجع', 'الوصف', 'مدين', 'دائن', 'الرصيد'],
      rows: transactions.map((row: any) => [row.date, row.entryNumber, row.referenceNumber || '—', row.description, Number(row.debit || 0), Number(row.credit || 0), Number(row.balance || 0)]),
      summary: [
        { label: 'إجمالي الرسوم', value: this.money(this.customer?.summary?.grossFees) },
        { label: 'إجمالي الخصومات', value: this.money(this.customer?.summary?.totalDiscounts) },
        { label: 'إجمالي المدفوعات', value: this.money(this.customer?.summary?.paymentTotal) },
        { label: 'الرصيد المتبقي', value: this.money(this.customer?.summary?.outstanding) },
      ],
      chart: { labels: ['الرسوم', 'الخصومات', 'المدفوع', 'المتبقي'], values: [Number(this.customer?.summary?.grossFees || 0), Number(this.customer?.summary?.totalDiscounts || 0), Number(this.customer?.summary?.paymentTotal || 0), Number(this.customer?.summary?.outstanding || 0)] },
      fileName: `rawafed-statement-${this.customer?.registrationNumber || this.customer?.id || 'student'}`,
      direction: 'rtl',
      locale: 'ar',
    };
  }

  money(value: unknown): string {
    return this.i18n.money(Number(value || 0));
  }

  openInvoice(invoice: any, event?: Event): void {
    if ((event?.target as HTMLElement | null)?.closest('a,button')) return;
    void this.router.navigate(['/finance/invoices', invoice.id]);
  }
}

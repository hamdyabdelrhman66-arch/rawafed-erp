import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentsService } from '../../../core/finance/payments.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';
import { I18nService } from '../../../core/i18n/i18n.service';
@Component({
  selector: 'app-payment-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-details.html',
  styleUrls: ['./payment-details.css', '../../../shared/finance/finance-ui.scss']
})
export class PaymentDetails implements OnInit {

  async printReceipt(): Promise<void> {
    if (!this.payment) return;
    await this.reportExport.printPdf(this.receiptReport());
  }
payment:any;
loading = true;
error = '';

constructor(
  private route: ActivatedRoute,
  private paymentsService: PaymentsService
  , private readonly reportExport: ReportExportService,
  public readonly i18n: I18nService,
){}

async ngOnInit(){
  const id = String(this.route.snapshot.paramMap.get('id') || '');
  try {
    const detail = await this.paymentsService.getReceipt(id);
    this.payment = { ...detail.payment, receiptDocument: detail.receipt, school: detail.school, taxEvents: detail.taxEvents };
    if (this.route.snapshot.queryParamMap.get('print') === '1') window.setTimeout(() => this.printReceipt(), 100);
  } catch (error: any) {
    this.error = error?.message || 'تعذر تحميل سند القبض.';
  } finally { this.loading = false; }
}

l(en: string, ar: string): string { return this.i18n.label(en, ar); }

money(value: unknown): string { return this.i18n.money(Number(value || 0)); }

private receiptReport(): ReportTable {
  const amount = Number(this.payment?.amount || 0);
  return {
    title: 'Payment Receipt',
    titleAr: 'سند قبض',
    subtitle: String(this.payment?.receiptNumber || ''),
    description: `${this.payment?.school?.schoolNameAr || 'مدارس روافد الشرق الأوسط العالمية'} · ${this.payment?.school?.addressAr || 'الرياض، حي الخليج، شارع بحر العرب'}`,
    columns: ['الطالب', 'البند', 'طريقة الدفع', 'التاريخ', 'رقم السند', 'المبلغ'],
    rows: (this.payment?.feeItems?.length ? this.payment.feeItems : [{ name: this.payment?.paymentItem || 'رسوم مدرسية', amount, netAmount: this.payment?.netAmount, vatAmount: this.payment?.vatAmount }]).map((item: any) => [
      this.payment?.studentName || 'غير مسجل', item.name || 'غير مسجل', this.payment?.method || 'غير مسجل', String(this.payment?.paidAt || '').slice(0, 10) || 'غير محدد', this.payment?.receiptNumber || '—', Number(item.amount || 0),
    ]),
    summary: [
      { label: 'إجمالي التعاقد السنوي', value: `${Number(this.payment?.contractTotal || 0).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س` },
      { label: 'الرصيد قبل الدفعة', value: `${Number(this.payment?.balanceBefore || 0).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س` },
      { label: 'المبلغ المستلم', value: `${amount.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س` },
      { label: 'القيمة قبل الضريبة', value: `${Number(this.payment?.netAmount || 0).toLocaleString('ar-SA')} ر.س` },
      { label: 'ضريبة ولي الأمر', value: `${Number(this.payment?.vatAmount || 0).toLocaleString('ar-SA')} ر.س` },
      { label: 'الرصيد المتبقي', value: `${Number(this.payment?.balanceAfter || 0).toLocaleString('ar-SA')} ر.س` },
      { label: 'الفاتورة الضريبية المرتبطة', value: this.payment?.invoices?.map((invoice: any) => invoice.invoiceNumber).filter(Boolean).join('، ') || 'لا يوجد' },
      { label: 'القيد المحاسبي', value: this.payment?.journalEntries?.map((journal: any) => journal.entryNumber).filter(Boolean).join('، ') || 'غير مسجل' },
    ],
    fileName: `rawafed-receipt-${this.payment?.receiptNumber || 'payment'}`,
    direction: 'rtl',
    locale: 'ar',
  };
}
}

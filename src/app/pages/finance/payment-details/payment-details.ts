import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentsService } from '../../../core/finance/payments.service';
import { ReportExportService, ReportTable } from '../../../core/reports/report-export.service';
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

constructor(
  private route: ActivatedRoute,
  private paymentsService: PaymentsService
  , private readonly reportExport: ReportExportService
){}

ngOnInit(){

  const id = Number(this.route.snapshot.paramMap.get('id'));

  this.paymentsService
    .getPayment(id)
    .subscribe((payment:any) => {
      this.payment = payment;
      if (payment && this.route.snapshot.queryParamMap.get('print') === '1') {
        window.setTimeout(() => this.printReceipt(), 100);
      }
    });

}

private receiptReport(): ReportTable {
  const amount = Number(this.payment?.amount || 0);
  return {
    title: 'Payment Receipt',
    titleAr: 'سند قبض',
    subtitle: String(this.payment?.receipt || ''),
    description: 'مدارس روافد الشرق الأوسط العالمية · الرياض، حي الخليج، شارع بحر العرب',
    columns: ['الطالب', 'البند', 'طريقة الدفع', 'التاريخ', 'رقم السند', 'المبلغ'],
    rows: [[this.payment?.patient || 'غير مسجل', this.payment?.package || 'غير مسجل', this.payment?.method || 'غير مسجل', this.payment?.date || 'غير محدد', this.payment?.receipt || '—', amount]],
    summary: [{ label: 'المبلغ المستلم', value: `${amount.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س` }],
    fileName: `rawafed-receipt-${this.payment?.receipt || 'payment'}`,
    direction: 'rtl',
    locale: 'ar',
  };
}
}

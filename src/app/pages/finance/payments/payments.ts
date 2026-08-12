import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PaymentsService } from '../../../core/finance/payments.service';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl: './payments.html',
  styleUrls: ['./payments.css', '../../../shared/finance/finance-ui.scss']
})
export class Payments implements OnInit {

  payments:any[] = [];
  search = '';
  loading = true;

  todayCollection = 0;
  monthlyCollection = 0;
  cashPayments = 0;
  bankTransfers = 0;

  constructor(
    private paymentsService: PaymentsService,
    public i18n: I18nService,
  ) {}

  ngOnInit(){

    this.paymentsService
      .getPayments()
      .subscribe({
        next: (payments:any[]) => {

        this.payments = payments;

    const today =
      new Date().toISOString().split('T')[0];

    const currentMonth =
      new Date().getMonth();

    this.todayCollection =
      this.payments
      .filter((p:any)=>p.date === today)
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount || 0),
        0
      );

    this.monthlyCollection =
      this.payments
      .filter((p:any)=>{

        if(!p.date) return false;

        return (
          new Date(p.date).getMonth()
          === currentMonth
        );

      })
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount || 0),
        0
      );

    this.cashPayments =
      this.payments
      .filter(
        (p:any)=>
          p.method === 'Cash'
      )
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount || 0),
        0
      );

    this.bankTransfers =
      this.payments
      .filter(
        (p:any)=>
          p.method === 'Bank Transfer' ||
          p.method === 'Transfer' ||
          p.method === 'Bank'
      )
      .reduce(
        (sum:number,p:any)=>
          sum + Number(p.amount || 0),
        0
      );
        this.loading = false;
      },
      error: () => {
        this.payments = [];
        this.loading = false;
      },
    });

  }

  get filteredPayments(): any[] {
    const query = this.search.trim().toLocaleLowerCase();
    if (!query) return this.payments;
    return this.payments.filter((payment) => [
      payment.receipt,
      payment.patient,
      payment.package,
      payment.method,
      payment.status,
      payment.registrationNumber,
    ].some((value) => String(value || '').toLocaleLowerCase().includes(query)));
  }

  l(en: string, ar: string): string {
    return this.i18n.label(en, ar);
  }

  money(value: unknown): string {
    return this.i18n.money(Number(value || 0));
  }

  methodLabel(value: unknown): string {
    const method = String(value || '').trim().toLowerCase();
    if (method === 'cash') return this.l('Cash', 'نقدي');
    if (['bank', 'bank transfer', 'transfer'].includes(method)) return this.l('Bank transfer', 'تحويل بنكي');
    if (method === 'card') return this.l('Card', 'بطاقة');
    if (method === 'cheque' || method === 'check') return this.l('Cheque', 'شيك');
    return String(value || this.l('Not recorded', 'غير مسجل'));
  }

  packageLabel(value: unknown): string {
    const labels: Record<string, [string, string]> = {
      tuition: ['Tuition', 'رسوم دراسية'],
      'school fees': ['School fees', 'رسوم مدرسية'],
      books: ['Books', 'كتب'],
      uniform: ['Uniform', 'زي مدرسي'],
      transportation: ['Transportation', 'نقل مدرسي'],
      activities: ['Activities', 'أنشطة'],
      registration: ['Registration', 'تسجيل'],
      'registration fee': ['Registration fee', 'رسوم تسجيل'],
    };
    const parts = String(value || 'School Fees').split('+').map((part) => part.trim()).filter(Boolean);
    return parts.map((part) => {
      const translated = labels[part.toLowerCase()];
      return translated ? this.l(translated[0], translated[1]) : part;
    }).join(` ${this.l('+', '+')} `);
  }

  statusLabel(value: unknown): string {
    const status = String(value || '').trim().toLowerCase();
    if (['paid', 'completed'].includes(status)) return this.l('Paid', 'مدفوع');
    if (status === 'pending') return this.l('Pending', 'قيد الانتظار');
    if (['cancelled', 'canceled'].includes(status)) return this.l('Cancelled', 'ملغي');
    return this.i18n.status(String(value || ''));
  }

  formatDate(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return this.l('Not specified', 'غير محدد');
    const date = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat(this.i18n.language() === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }

  printReceipt(payment: any) {
    window.open(
      `/finance/payment-details/${encodeURIComponent(String(payment.id))}?print=1`,
      '_blank',
      'noopener,noreferrer',
    );
  }

}

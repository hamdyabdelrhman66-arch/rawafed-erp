import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InvoicesService } from '../../../core/finance/invoices.service';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule
  ],
  templateUrl: './invoices.html',
  styleUrls: ['./invoices.css', '../../../shared/finance/finance-ui.scss']
})
export class Invoices implements OnInit {

  invoices:any[] = [];

  totalInvoices = 0;
  totalRevenue = 0;
  paidInvoices = 0;
  pendingInvoices = 0;
  search = '';
  categoryFilter = '';
  statusFilter = '';

  constructor(
    private invoicesService: InvoicesService,
    public readonly i18n: I18nService
  ) {}

  ngOnInit(){

    this.invoicesService
      .getInvoices()
      .subscribe((invoices:any[]) => {

        this.invoices = invoices;

    this.totalInvoices =
      this.invoices.length;

    this.totalRevenue =
      this.invoices.reduce(
        (sum:number,item:any)=>
          sum + Number(item.total || item.amount || 0),
        0
      );

    this.paidInvoices =
      this.invoices
      .filter(
        (i:any)=>i.status === 'Paid'
      )
      .reduce(
        (sum:number,item:any)=>
          sum + Number(item.total || item.amount || 0),
        0
      );

    this.pendingInvoices =
      this.invoices
      .filter(
        (i:any)=>i.status === 'Pending'
      )
      .reduce(
        (sum:number,item:any)=>
          sum + Number(item.total || item.amount || 0),
        0
      );

      });

  }

  get categories(): string[] { return [...new Set(this.invoices.map((invoice) => invoice.category || 'LEGACY_COMBINED'))]; }
  get filteredInvoices(): any[] {
    const query = this.search.trim().toLowerCase();
    return this.invoices.filter((invoice) =>
      (!query || [invoice.invoiceNumber, invoice.patient, invoice.service, invoice.categoryLabel].join(' ').toLowerCase().includes(query)) &&
      (!this.categoryFilter || invoice.category === this.categoryFilter) &&
      (!this.statusFilter || invoice.status === this.statusFilter)
    );
  }
  l(en: string, ar: string): string { return this.i18n.label(en, ar); }
  categoryLabel(invoice: any): string {
    if (invoice.legacyCombined || invoice.category === 'LEGACY_COMBINED') return this.l('Legacy Combined Invoice', 'فاتورة مجمعة قديمة');
    const labels: Record<string, [string, string]> = {
      REGISTRATION: ['Registration', 'التسجيل'], TUITION: ['Tuition', 'الرسوم الدراسية'], BOOKS: ['Books', 'الكتب'],
      UNIFORM: ['Uniform', 'الزي المدرسي'], TRANSPORTATION: ['Transportation', 'النقل'], ACTIVITIES: ['Activities', 'الأنشطة'], OTHER_SERVICES: ['Other Services', 'خدمات أخرى']
    };
    const label = labels[invoice.category];
    return label ? this.l(label[0], label[1]) : invoice.categoryLabel || invoice.service;
  }
  statusLabel(value: string): string {
    const labels: Record<string, [string, string]> = { Paid: ['Paid', 'مدفوعة'], Pending: ['Pending', 'معلقة'], 'Partially Paid': ['Partially Paid', 'مدفوعة جزئيًا'], Void: ['Void', 'ملغاة'] };
    const label = labels[value]; return label ? this.l(label[0], label[1]) : value;
  }
  vatLabel(invoice: any): string { return Number(invoice.vat || 0) > 0 ? this.l('Standard 15%', 'قياسية 15%') : this.l('Exempt', 'معفى'); }

}

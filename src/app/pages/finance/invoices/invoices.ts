import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InvoicesService } from '../../../core/finance/invoices.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    TranslatePipe
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
  dateFilter = '';

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
      (!query || [invoice.invoiceNumber, invoice.patient, invoice.studentArabicName, invoice.registrationNumber, invoice.nationalId, invoice.service, invoice.categoryLabel].join(' ').toLowerCase().includes(query)) &&
      (!this.categoryFilter || invoice.category === this.categoryFilter) &&
      (!this.statusFilter || invoice.status === this.statusFilter) &&
      (!this.dateFilter || invoice.date === this.dateFilter)
    );
  }
  categoryLabel(invoice: any): string {
    const key = `invoice.category_${String(invoice.category || 'legacy_combined').toLowerCase()}`;
    const translated = this.i18n.t(key);
    return translated === key ? invoice.categoryLabel || invoice.service : translated;
  }
  statusLabel(value: string): string { return this.i18n.status(value); }
  vatLabel(invoice: any): string { return this.i18n.t(Number(invoice.vat || 0) > 0 ? 'invoice.vat_standard' : 'invoice.vat_exempt'); }

}

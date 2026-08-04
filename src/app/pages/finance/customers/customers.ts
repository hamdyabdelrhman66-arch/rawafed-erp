import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './customers.html',
  styleUrls: ['./customers.css', '../../../shared/finance/finance-ui.scss']
})
export class Customers implements OnInit {
  customers: any[] = [];
  searchText = '';
  gradeFilter = '';
  balanceFilter = 'all';
  loading = true;

  constructor(private readonly accounting: AccountingService, public readonly i18n: I18nService) {}

  async ngOnInit(): Promise<void> {
    try { this.customers = await this.accounting.getCustomers(); }
    finally { this.loading = false; }
  }

  get filteredCustomers(): any[] {
    const query = this.searchText.trim().toLowerCase();
    return this.customers.filter((customer) =>
      (!query ||
      [customer.customerCode, customer.nameAr, customer.nameEn, customer.registrationNumber, customer.phone, customer.email, customer.nationalId]
        .join(' ')
        .toLowerCase()
        .includes(query)) &&
      (!this.gradeFilter || customer.grade === this.gradeFilter) &&
      (this.balanceFilter === 'all' || (this.balanceFilter === 'outstanding' ? Number(customer.summary?.outstanding || 0) > 0 : Number(customer.summary?.outstanding || 0) <= 0))
    );
  }

  get grades(): string[] { return [...new Set(this.customers.map(row => row.grade).filter(Boolean))].sort() as string[]; }
  resetFilters(): void { this.searchText = ''; this.gradeFilter = ''; this.balanceFilter = 'all'; }
  l(en: string, ar: string): string { return this.i18n.label(en, ar); }

  get totals(): any {
    return this.customers.reduce((sum, customer) => ({
      outstanding: sum.outstanding + Number(customer.summary?.outstanding || 0),
      credit: sum.credit + Number(customer.summary?.credit || 0),
      invoices: sum.invoices + Number(customer.summary?.invoiceTotal || 0),
      payments: sum.payments + Number(customer.summary?.paymentTotal || 0)
    }), { outstanding: 0, credit: 0, invoices: 0, payments: 0 });
  }

  money(value: unknown): string {
    return this.i18n.money(Number(value || 0));
  }
}

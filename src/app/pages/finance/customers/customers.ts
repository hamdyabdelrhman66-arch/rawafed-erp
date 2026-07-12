import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';

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

  constructor(private readonly accounting: AccountingService) {}

  async ngOnInit(): Promise<void> {
    this.customers = await this.accounting.getCustomers();
  }

  get filteredCustomers(): any[] {
    const query = this.searchText.trim().toLowerCase();
    return this.customers.filter((customer) =>
      !query ||
      [customer.customerCode, customer.nameAr, customer.nameEn, customer.registrationNumber, customer.phone, customer.email, customer.nationalId]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }

  get totals(): any {
    return this.customers.reduce((sum, customer) => ({
      outstanding: sum.outstanding + Number(customer.summary?.outstanding || 0),
      credit: sum.credit + Number(customer.summary?.credit || 0),
      invoices: sum.invoices + Number(customer.summary?.invoiceTotal || 0),
      payments: sum.payments + Number(customer.summary?.paymentTotal || 0)
    }), { outstanding: 0, credit: 0, invoices: 0, payments: 0 });
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} SAR`;
  }
}

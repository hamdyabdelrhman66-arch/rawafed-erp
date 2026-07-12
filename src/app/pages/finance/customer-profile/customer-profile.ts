import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';

@Component({
  selector: 'app-customer-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './customer-profile.html',
  styleUrls: ['./customer-profile.css', '../../../shared/finance/finance-ui.scss']
})
export class CustomerProfile implements OnInit {
  customer: any;
  statement: any;
  installments: any = { plans: [], installments: [] };
  tab = 'overview';
  planForm = {
    planType: 'Monthly',
    name: '',
    totalAmount: 0,
    startDate: new Date().toISOString().slice(0, 10),
    installmentsCount: 10,
    lateFeeType: 'fixed',
    lateFeeValue: 0,
    gracePeriodDays: 0,
    notes: ''
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly accounting: AccountingService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const id = String(this.route.snapshot.paramMap.get('id'));
    [this.customer, this.statement, this.installments] = await Promise.all([
      this.accounting.getCustomer(id),
      this.accounting.getCustomerStatement(id),
      this.accounting.getCustomerInstallments(id)
    ]);
    this.planForm.totalAmount = Number(this.customer?.summary?.outstanding || 0);
  }

  async savePlan(): Promise<void> {
    await this.accounting.createCustomerInstallmentPlan(this.customer.id, this.planForm);
    this.installments = await this.accounting.getCustomerInstallments(this.customer.id);
    this.tab = 'installments';
  }

  printStatement(): void {
    window.print();
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} SAR`;
  }
}

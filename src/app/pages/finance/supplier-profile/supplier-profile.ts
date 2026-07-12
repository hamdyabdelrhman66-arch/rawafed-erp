import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountingService } from '../../../core/finance/accounting.service';

@Component({
  selector: 'app-supplier-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './supplier-profile.html',
  styleUrls: ['./supplier-profile.css', '../../../shared/finance/finance-ui.scss']
})
export class SupplierProfile implements OnInit {
  profile: any;
  paymentAccounts: any[] = [];
  tab = 'statement';
  paymentForm = {
    supplierId: '',
    paymentType: 'partial',
    amount: 0,
    paymentAccountId: '',
    paymentMethod: 'Cash',
    paidAt: new Date().toISOString().slice(0, 10),
    notes: ''
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly accounting: AccountingService
  ) {}

  async ngOnInit(): Promise<void> {
    const id = String(this.route.snapshot.paramMap.get('id'));
    [this.profile, this.paymentAccounts] = await Promise.all([
      this.accounting.getSupplierProfile(id),
      this.accounting.getPaymentAccounts()
    ]);
    this.paymentForm.supplierId = id;
    this.paymentForm.amount = Math.max(0, Number(this.profile?.summary?.currentBalance || 0));
  }

  async savePayment(): Promise<void> {
    this.profile = await this.accounting.createSupplierPayment(this.paymentForm);
    this.paymentForm.amount = 0;
    this.paymentForm.notes = '';
    this.tab = 'payments';
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} SAR`;
  }
}

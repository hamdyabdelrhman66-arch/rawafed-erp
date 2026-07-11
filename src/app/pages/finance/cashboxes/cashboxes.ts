import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountingAccount, AccountingService } from '../../../core/finance/accounting.service';

@Component({
  selector: 'app-cashboxes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cashboxes.html',
  styleUrls: ['./cashboxes.css', '../../../shared/finance/finance-ui.scss']
})
export class Cashboxes implements OnInit {
  cashboxes: any[] = [];
  paymentAccounts: AccountingAccount[] = [];
  form = { name: '', openingBalance: 0, notes: '', status: 'active' };
  transfer = { fromAccountId: '', toAccountId: '', amount: 0, date: new Date().toISOString().slice(0, 10), description: '' };

  constructor(private readonly accounting: AccountingService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  get totalCurrent(): number {
    return this.cashboxes.reduce((sum, item) => sum + Number(item.currentBalance || 0), 0);
  }

  async load(): Promise<void> {
    const [cashboxes, paymentAccounts] = await Promise.all([
      this.accounting.getCashboxes(),
      this.accounting.getPaymentAccounts()
    ]);
    this.cashboxes = cashboxes;
    this.paymentAccounts = paymentAccounts;
    this.transfer.fromAccountId ||= paymentAccounts[0]?.id || '';
    this.transfer.toAccountId ||= paymentAccounts[1]?.id || paymentAccounts[0]?.id || '';
  }

  async saveCashbox(): Promise<void> {
    await this.accounting.createCashbox(this.form);
    this.form = { name: '', openingBalance: 0, notes: '', status: 'active' };
    await this.load();
  }

  async saveTransfer(): Promise<void> {
    await this.accounting.createTransfer(this.transfer);
    this.transfer.amount = 0;
    this.transfer.description = '';
    await this.load();
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US')} SAR`;
  }
}

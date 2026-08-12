import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AccountingAccount, AccountingService } from '../../../core/finance/accounting.service';
import { formatAccountingBalance } from '../../../core/finance/accounting-balance';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';

@Component({
  selector: 'app-banks',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './banks.html',
  styleUrls: ['./banks.css', '../../../shared/finance/finance-ui.scss']
})
export class Banks implements OnInit {
  banks: any[] = [];
  paymentAccounts: AccountingAccount[] = [];
  form = { bankName: '', iban: '', accountNumber: '', accountId: '', notes: '', status: 'active' };
  transfer = { fromAccountId: '', toAccountId: '', amount: 0, date: new Date().toISOString().slice(0, 10), description: '' };

  constructor(private readonly accounting: AccountingService, private readonly feedback: FeedbackService) {}

  async ngOnInit(): Promise<void> { await this.load(); }

  get totalCurrent(): number {
    return this.banks.filter((item) => item.status === 'active').reduce((sum, item) => sum + Number(item.currentBalance || 0), 0);
  }

  get activeBanks(): number {
    return this.banks.filter((item) => item.status === 'active').length;
  }

  get availableBankAccounts(): AccountingAccount[] {
    const linked = new Set(this.banks.filter((item) => item.masterRecord).map((item) => item.accountId));
    return this.paymentAccounts.filter((account) => account.isBankAccount && !linked.has(account.id));
  }

  get destinationAccounts(): AccountingAccount[] {
    return this.paymentAccounts.filter((account) => account.id !== this.transfer.fromAccountId);
  }

  get canPostTransfer(): boolean {
    return Boolean(
      this.transfer.fromAccountId &&
      this.transfer.toAccountId &&
      this.transfer.fromAccountId !== this.transfer.toAccountId &&
      Number(this.transfer.amount) > 0
    );
  }

  async load(): Promise<void> {
    const [banks, paymentAccounts] = await Promise.all([this.accounting.getBanks(), this.accounting.getPaymentAccounts()]);
    this.banks = banks;
    this.paymentAccounts = paymentAccounts;
    this.transfer.fromAccountId ||= paymentAccounts[0]?.id || '';
    this.ensureDifferentDestination();
  }

  onSourceAccountChange(): void { this.ensureDifferentDestination(); }

  async saveBank(): Promise<void> {
    if (!this.form.bankName.trim() || !this.form.accountId) {
      this.feedback.validation('يجب إدخال اسم البنك واختيار حساب البنك المرتبط.');
      return;
    }
    try {
      await this.accounting.createBank(this.form);
      this.form = { bankName: '', iban: '', accountNumber: '', accountId: '', notes: '', status: 'active' };
      await this.load();
      this.feedback.success('Bank account created successfully.');
    } catch (error) {
      this.feedback.error('Bank account could not be saved.', safeErrorMessage(error));
    }
  }

  async saveTransfer(): Promise<void> {
    if (!this.canPostTransfer) {
      this.feedback.validation(
        this.paymentAccounts.length < 2
          ? 'Create at least two cash or bank accounts before posting a transfer.'
          : 'Choose two different accounts and enter an amount greater than zero.'
      );
      return;
    }
    try {
      await this.accounting.createTransfer(this.transfer);
      this.transfer.amount = 0;
      this.transfer.description = '';
      await this.load();
      this.feedback.success('Bank transfer posted successfully.');
    } catch (error) {
      this.feedback.error('Bank transfer could not be posted.', safeErrorMessage(error));
    }
  }

  money(value: unknown): string {
    return `SAR ${Math.abs(Number(value || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }

  accountingBalance(itemOrValue: any): string {
    const value = typeof itemOrValue === 'object' ? Number(itemOrValue.currentBalance || 0) : Number(itemOrValue || 0);
    return formatAccountingBalance(value, 'ar');
  }

  private ensureDifferentDestination(): void {
    if (this.transfer.toAccountId === this.transfer.fromAccountId || !this.transfer.toAccountId) {
      this.transfer.toAccountId = this.destinationAccounts[0]?.id || '';
    }
  }
}

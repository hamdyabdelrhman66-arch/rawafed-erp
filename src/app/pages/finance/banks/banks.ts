import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountingAccount, AccountingService } from '../../../core/finance/accounting.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';

@Component({
  selector: 'app-banks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './banks.html',
  styleUrls: ['./banks.css', '../../../shared/finance/finance-ui.scss']
})
export class Banks implements OnInit {
  banks: any[] = [];
  paymentAccounts: AccountingAccount[] = [];
  form = { bankName: '', iban: '', accountNumber: '', openingBalance: 0, notes: '', status: 'active' };
  transfer = { fromAccountId: '', toAccountId: '', amount: 0, date: new Date().toISOString().slice(0, 10), description: '' };

  constructor(private readonly accounting: AccountingService, private readonly feedback: FeedbackService) {}

  async ngOnInit(): Promise<void> { await this.load(); }

  get totalCurrent(): number {
    return this.banks.reduce((sum, item) => sum + Number(item.currentBalance || 0), 0);
  }

  async load(): Promise<void> {
    const [banks, paymentAccounts] = await Promise.all([this.accounting.getBanks(), this.accounting.getPaymentAccounts()]);
    this.banks = banks;
    this.paymentAccounts = paymentAccounts;
    this.transfer.fromAccountId ||= paymentAccounts[0]?.id || '';
    this.transfer.toAccountId ||= paymentAccounts[1]?.id || paymentAccounts[0]?.id || '';
  }

  async saveBank(): Promise<void> {
    try {
      await this.accounting.createBank(this.form);
      this.form = { bankName: '', iban: '', accountNumber: '', openingBalance: 0, notes: '', status: 'active' };
      await this.load();
      this.feedback.success('Bank account created successfully.');
    } catch (error) {
      this.feedback.error('Bank account could not be saved.', safeErrorMessage(error));
    }
  }

  async saveTransfer(): Promise<void> {
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
    return `${Number(value || 0).toLocaleString('en-US')} SAR`;
  }
}

import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FinancePackage, FinanceStatus } from '../../core/finance/finance.models';
import { FinanceStorageService } from '../../core/finance/finance-storage.service';
import { AdmissionRegistration, PaymentStatus } from '../../core/models/admission.models';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'raw-students',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './students.component.html',
  styleUrls: ['./students.component.scss']
})
export class StudentsComponent implements OnInit, OnDestroy {
  private readonly storage = inject(StorageService);
  private readonly finance = inject(FinanceStorageService);
  private readonly financeAccounts = signal<FinancePackage[]>([]);
  private readonly refreshFinanceAccounts = () => this.loadFinanceAccounts();
  private readonly refreshFromStorage = (event: StorageEvent) => {
    if (event.key === 'rawafed_finance' || event.key === 'rawafed.registrations') this.loadFinanceAccounts();
  };
  private readonly refreshWhenVisible = () => {
    if (!document.hidden) this.loadFinanceAccounts();
  };

  readonly students = computed(() => this.storage.registrations().filter((item) => item.status === 'approved'));

  ngOnInit(): void {
    this.loadFinanceAccounts();
    window.addEventListener('rawafed-finance-updated', this.refreshFinanceAccounts);
    window.addEventListener('storage', this.refreshFromStorage);
    window.addEventListener('focus', this.refreshFinanceAccounts);
    document.addEventListener('visibilitychange', this.refreshWhenVisible);
  }

  ngOnDestroy(): void {
    window.removeEventListener('rawafed-finance-updated', this.refreshFinanceAccounts);
    window.removeEventListener('storage', this.refreshFromStorage);
    window.removeEventListener('focus', this.refreshFinanceAccounts);
    document.removeEventListener('visibilitychange', this.refreshWhenVisible);
  }

  initials(item: AdmissionRegistration): string {
    return (item.student.englishName || 'RS').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  paymentStatus(item: AdmissionRegistration): PaymentStatus {
    const account = this.financeAccounts().find((financeAccount) =>
      financeAccount.registrationId === item.id ||
      financeAccount.registrationNumber === item.registrationNumber
    );

    return this.normalizePaymentStatus(account?.status || item.financial.paymentStatus);
  }

  private loadFinanceAccounts(): void {
    this.finance.getPackages().subscribe((accounts) => {
      this.financeAccounts.set(accounts);
    });
  }

  private normalizePaymentStatus(status: FinanceStatus | PaymentStatus | undefined): PaymentStatus {
    if (status === 'Paid' || status === 'Partial') return status;
    return 'Unpaid';
  }
}

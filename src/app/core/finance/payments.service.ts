import { Injectable } from '@angular/core';
import { FinanceStorageService } from './finance-storage.service';

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  constructor(private readonly finance: FinanceStorageService) {}

  getPayments() { return this.finance.getPayments(); }
  getPayment(id: number) { return this.finance.getPayment(id); }
  addPayment(payment: any) { return this.finance.addPayment(payment); }
  updatePayment(id: number, payment: any) { return this.finance.updatePayment(id, payment); }
  deletePayment(id: number) { return this.finance.deletePayment(id); }
}

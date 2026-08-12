import { Injectable } from "@angular/core";
import { FinanceStorageService } from "./finance-storage.service";
import { ApiService } from "../api/api.service";

@Injectable({ providedIn: "root" })
export class PaymentsService {
  constructor(
    private readonly finance: FinanceStorageService,
    private readonly api: ApiService,
  ) {}

  getPayments() {
    return this.finance.getPayments();
  }
  getPayment(id: number) {
    return this.finance.getPayment(id);
  }
  addPayment(payment: any) {
    return this.finance.addPayment(payment);
  }
  recordPayment(payment: any): Promise<any> {
    return this.api.post("/finance/payments", payment);
  }
  previewPayment(payment: any): Promise<any> {
    return this.api.post("/finance/payments/preview", payment);
  }
  getReceipt(paymentId: string): Promise<any> {
    return this.api.get(`/finance/payments/${encodeURIComponent(paymentId)}/receipt`);
  }
  getVatConfiguration(): Promise<any> {
    return this.api.get('/finance/vat/configuration');
  }
  updateVatConfiguration(input: { basis: 'INVOICE_ACCRUAL' | 'CASH'; confirmation: boolean; reason: string }): Promise<any> {
    return this.api.put('/finance/vat/configuration', input);
  }
  updatePayment(id: number, payment: any) {
    return this.finance.updatePayment(id, payment);
  }
  deletePayment(id: number) {
    return this.finance.deletePayment(id);
  }
}

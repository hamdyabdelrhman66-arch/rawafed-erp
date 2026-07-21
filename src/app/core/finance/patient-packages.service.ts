import { Injectable } from '@angular/core';
import { FinanceStorageService } from './finance-storage.service';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class PatientPackagesService {
  constructor(private readonly finance: FinanceStorageService, private readonly api: ApiService) {}

  getPackages() { return this.finance.getPackages(); }
  getPackage(id: number) { return this.finance.getPackage(id); }
  addPackage(studentPackage: any) { return this.finance.addPackage(studentPackage); }
  updatePackage(id: number, studentPackage: any) { return this.finance.updatePackage(id, studentPackage); }
  deletePackage(id: number) { return this.finance.deletePackage(id); }
  getPaymentContext(studentId: string, invoiceId?: string, installmentId?: string): Promise<any> {
    const params = new URLSearchParams();
    if (invoiceId) params.set('invoiceId', invoiceId);
    if (installmentId) params.set('installmentId', installmentId);
    const query = params.toString();
    return this.api.get<any>(`/finance/students/${encodeURIComponent(studentId)}/payment-context${query ? `?${query}` : ''}`)
      .then((response) => ({ ...response, account: this.finance.fromBackendAccount(response.account) }));
  }
}

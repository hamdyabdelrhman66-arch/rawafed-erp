import { Injectable } from '@angular/core';
import { FinanceStorageService } from './finance-storage.service';

@Injectable({ providedIn: 'root' })
export class InvoicesService {
  constructor(private readonly finance: FinanceStorageService) {}

  getInvoices() { return this.finance.getInvoices(); }
  getInvoice(id: number) { return this.finance.getInvoice(id); }
  addInvoice(invoice: any) { return this.finance.addInvoice(invoice); }
  updateInvoice(id: number, invoice: any) { return this.finance.updateInvoice(id, invoice); }
  deleteInvoice(id: number) { return this.finance.deleteInvoice(id); }
}

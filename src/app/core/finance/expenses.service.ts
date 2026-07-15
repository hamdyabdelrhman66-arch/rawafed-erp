import { Injectable } from '@angular/core';
import { FinanceStorageService } from './finance-storage.service';

@Injectable({ providedIn: 'root' })
export class ExpensesService {
  constructor(private readonly finance: FinanceStorageService) {}

  getExpenses() { return this.finance.getExpenses(); }
  getExpense(id: number) { return this.finance.getExpense(id); }
  addExpense(expense: any) { return this.finance.addExpense(expense); }
  payExpense(id: string, payload: any) { return this.finance.payExpense(id, payload); }
  updateExpense(id: number, expense: any) { return this.finance.updateExpense(id, expense); }
  deleteExpense(id: number) { return this.finance.deleteExpense(id); }
}

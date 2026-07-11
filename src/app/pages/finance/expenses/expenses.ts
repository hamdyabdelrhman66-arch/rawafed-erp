import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExpensesService } from '../../../core/finance/expenses.service';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './expenses.html',
  styleUrls: ['./expenses.css', '../../../shared/finance/finance-ui.scss']
})
export class Expenses implements OnInit {
  expenses: any[] = [];
  searchText = '';

  totalExpenses = 0;
  paidExpenses = 0;
  unpaidExpenses = 0;
  vatTotal = 0;

  constructor(private readonly expensesService: ExpensesService) {}

  ngOnInit(): void {
    this.expensesService.getExpenses().subscribe((expenses: any[]) => {
      this.expenses = expenses;
      this.totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.totalAmount ?? expense.amount ?? 0), 0);
      this.paidExpenses = expenses
        .filter((expense) => expense.paymentStatus === 'Paid' || expense.status === 'Paid')
        .reduce((sum, expense) => sum + Number(expense.totalAmount ?? expense.amount ?? 0), 0);
      this.unpaidExpenses = expenses
        .filter((expense) => expense.paymentStatus === 'Unpaid' || expense.status === 'Unpaid')
        .reduce((sum, expense) => sum + Number(expense.totalAmount ?? expense.amount ?? 0), 0);
      this.vatTotal = expenses.reduce((sum, expense) => sum + Number(expense.vatAmount || 0), 0);
    });
  }

  get filteredExpenses(): any[] {
    const query = this.searchText.trim().toLowerCase();
    return this.expenses.filter((expense) =>
      !query ||
      [
        expense.expenseNo,
        expense.no,
        expense.supplierName,
        expense.category,
        expense.invoiceType,
        expense.paymentStatus,
        expense.paymentFrom,
        expense.journalEntryNo
      ].join(' ').toLowerCase().includes(query)
    );
  }

  money(value: unknown): string {
    return `${Number(value || 0).toLocaleString('en-US')} SAR`;
  }
}

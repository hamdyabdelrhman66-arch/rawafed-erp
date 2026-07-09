import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ExpensesService } from '../../../core/finance/expenses.service';

@Component({
  selector: 'app-add-expense',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-expense.html',
  styleUrls: ['./add-expense.css', '../../../shared/finance/finance-ui.scss']
})
export class AddExpense {

  categories = [
    'Rent',
    'Salaries',
    'Utilities',
    'Maintenance',
    'Supplies',
    'Marketing',
    'Other'
  ];

  methods = [
    'Cash',
    'Bank Transfer',
    'Card'
  ];

  expense = {
    category: 'Rent',
    description: '',
    amount: 0,
    date: '',
    method: 'Cash',
    status: 'Paid',
    notes: ''
  };

  constructor(
    private router: Router,
    private expensesService: ExpensesService
  ) {}

  saveExpense() {

    const expense = {
      id: Date.now(),
      no: 'EXP-' + Date.now(),
      title: this.expense.description,
      ...this.expense
    };

    this.expensesService
      .addExpense(expense)
      .subscribe(() => {
        alert('Expense Added Successfully');
        this.router.navigate(['/finance/expenses']);
      });

  }

}

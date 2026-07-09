import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ExpensesService } from '../../../core/finance/expenses.service';

@Component({
  selector: 'app-edit-expense',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-expense.html',
  styleUrls: ['./edit-expense.css', '../../../shared/finance/finance-ui.scss']
})
export class EditExpense {

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

  expense:any = {
    no: 'EXP-001',
    category: 'Rent',
    description: 'Clinic Rent',
    amount: 5000,
    date: '2026-06-01',
    method: 'Bank Transfer',
    status: 'Paid',
    notes: 'Monthly clinic rent payment'
  };

  expenseId = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private expensesService: ExpensesService
  ) {}

  ngOnInit() {

    this.expenseId =
      Number(
        this.route.snapshot.paramMap.get('id')
      );

    if(!this.expenseId){
      return;
    }

    this.expensesService
      .getExpense(this.expenseId)
      .subscribe((expense:any) => {
        this.expense = expense;
      });

  }

  saveExpense() {

    this.expensesService
      .updateExpense(this.expenseId, this.expense)
      .subscribe(() => {
        alert('Expense Updated Successfully');
        this.router.navigate(['/finance/expenses']);
      });

  }

}

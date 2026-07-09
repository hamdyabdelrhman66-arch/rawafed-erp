import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ExpensesService } from '../../../core/finance/expenses.service';
@Component({
  selector: 'app-expense-details',
  standalone: true,
  imports: [
  CommonModule,
  RouterLink
],
  templateUrl: './expense-details.html',
  styleUrls: ['./expense-details.css', '../../../shared/finance/finance-ui.scss']
})
export class ExpenseDetails {

  expense:any = {

    no: 'EXP-001',
    category: 'Rent',
    description: 'Clinic Rent',
    amount: 5000,
    date: '01/06/2026',
    status: 'Paid',
    method: 'Bank Transfer',
    vendor: 'Property Owner',
    notes: 'Monthly clinic rent'

  };

  constructor(
    private route: ActivatedRoute,
    private expensesService: ExpensesService
  ) {}

  ngOnInit() {

    const id =
      Number(
        this.route.snapshot.paramMap.get('id')
      );

    if(!id){
      return;
    }

    this.expensesService
      .getExpense(id)
      .subscribe((expense:any) => {
        this.expense = expense;
      });

  }

}

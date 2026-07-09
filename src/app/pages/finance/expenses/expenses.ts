import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ExpensesService } from '../../../core/finance/expenses.service';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './expenses.html',
  styleUrls: ['./expenses.css', '../../../shared/finance/finance-ui.scss']
})

export class Expenses {

  expenses:any[] = [];

totalExpenses = 0;
approvedExpenses = 0;
pendingExpenses = 0;

constructor(
  private expensesService: ExpensesService
) {}

ngOnInit(){

  this.expensesService
    .getExpenses()
    .subscribe((expenses:any[]) => {

      this.expenses = expenses;

  this.totalExpenses =
    this.expenses.reduce(
      (sum:number, e:any) => sum + Number(e.amount),
      0
    );

  this.approvedExpenses =
    this.expenses
      .filter((e:any)=>e.status === 'Approved')
      .reduce(
        (sum:number,e:any)=>sum + Number(e.amount),
        0
      );

  this.pendingExpenses =
    this.expenses
      .filter((e:any)=>e.status !== 'Approved')
      .reduce(
        (sum:number,e:any)=>sum + Number(e.amount),
        0
      );

    });

}
}

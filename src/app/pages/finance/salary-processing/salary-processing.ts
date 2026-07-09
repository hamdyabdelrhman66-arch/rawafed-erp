import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpensesService } from '../../../core/finance/expenses.service';
import { StaffService } from '../../../core/finance/staff.service';

@Component({
  selector:'app-salary-processing',
  standalone:true,
  imports:[
    CommonModule,
    FormsModule
  ],
  templateUrl:'./salary-processing.html',
  styleUrls: ['./salary-processing.css', '../../../shared/finance/finance-ui.scss']
})
export class SalaryProcessing implements OnInit {

  employees:any[] = [];

  constructor(
    private expensesService: ExpensesService,
    private staffService: StaffService
  ) {}

  ngOnInit(){

    this.staffService.getStaff().subscribe((staff) => {
      this.employees = staff.map(
  (emp:any)=>({

    id: emp.id,

    name: emp.name,

    position: emp.position,

    salary: Number(emp.salary),

    deduction: 0,

    bonus: 0,

    status: emp.status || 'Pending'

  })
);
    });

  }

processSalaries(){

  this.employees.forEach((employee:any)=>{

    this.expensesService.addExpense({

      id: Date.now(),

      title: 'Salary - ' + employee.name,

      amount: employee.salary,

      category:'Payroll',

      date: new Date()
        .toISOString()
        .split('T')[0]

    }).subscribe();
employee.status = 'Paid';
this.staffService.updateStaff(employee.id, employee).subscribe();
  });

  alert('All Salaries Processed');

}
}

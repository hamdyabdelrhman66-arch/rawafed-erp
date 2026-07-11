import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StaffService } from '../../../core/finance/staff.service';

@Component({
  selector: 'app-payroll',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './payroll.html',
  styleUrls: ['./payroll.css', '../../../shared/finance/finance-ui.scss']
})
export class Payroll implements OnInit {

  employees:any[] = [];

  totalEmployees = 0;
  monthlySalaries = 0;
  paidSalaries = 0;
  pendingSalaries = 0;

  constructor(private readonly staffService: StaffService) {}

  ngOnInit() {

    this.staffService.getStaff().subscribe((staff) => {
      this.employees = staff.map((employee:any) => ({

      id: employee.id || Date.now(),

      name: employee.name,

      position: employee.position,

      salary: employee.salary,

      deduction: 0,

      net: employee.salary,

      status: employee.status || 'Pending',

      startDate: employee.startDate

    }));

    this.calculateStats();
    });

  }

  calculateStats() {

    this.totalEmployees =
      this.employees.length;

    this.monthlySalaries =
      this.employees.reduce(
        (sum, emp) => sum + Number(emp.salary),
        0
      );

    this.paidSalaries =
      this.employees
      .filter(emp => emp.status === 'Paid')
      .reduce(
        (sum, emp) => sum + Number(emp.net),
        0
      );

    this.pendingSalaries =
      this.employees
      .filter(emp => emp.status === 'Pending')
      .reduce(
        (sum, emp) => sum + Number(emp.net),
        0
      );

  }

}

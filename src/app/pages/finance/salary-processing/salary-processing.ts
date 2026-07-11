import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StaffService } from '../../../core/finance/staff.service';

@Component({
  selector:'app-salary-processing',
  standalone:true,
  imports:[
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl:'./salary-processing.html',
  styleUrls: ['./salary-processing.css', '../../../shared/finance/finance-ui.scss']
})
export class SalaryProcessing implements OnInit {

  employees:any[] = [];
  payrollRuns:any[] = [];
  period = new Date().toISOString().slice(0, 7);
  paymentDate = new Date().toISOString().slice(0, 10);
  message = '';
  isProcessing = false;

  constructor(
    private staffService: StaffService
  ) {}

  ngOnInit(){

    this.staffService.getStaff().subscribe((staff) => {
      this.employees = staff.map(
  (emp:any)=>({

    id: emp.id,

    name: emp.name,

    position: emp.position,

    basicSalary: Number(emp.basicSalary ?? emp.salary ?? 0),
    housingAllowance: Number(emp.housingAllowance || 0),
    transportationAllowance: Number(emp.transportationAllowance || 0),
    otherAllowances: Number(emp.otherAllowances || 0),

    absenceDeduction: 0,
    lateDeduction: 0,
    loanDeduction: 0,
    advanceDeduction: 0,
    gosiEmployee: 0,
    gosiEmployer: 0,
    otherDeductions: 0,

    bonus: 0,
    overtime: 0,

    status: emp.status || 'Pending'

  })
);
    });
    this.staffService.getPayrollRuns().subscribe((runs) => this.payrollRuns = runs);

  }

  gross(employee:any): number {
    return Number(employee.basicSalary || 0) + Number(employee.housingAllowance || 0) + Number(employee.transportationAllowance || 0) + Number(employee.otherAllowances || 0) + Number(employee.overtime || 0) + Number(employee.bonus || 0);
  }

  deductions(employee:any): number {
    return Number(employee.absenceDeduction || 0) + Number(employee.lateDeduction || 0) + Number(employee.loanDeduction || 0) + Number(employee.advanceDeduction || 0) + Number(employee.gosiEmployee || 0) + Number(employee.otherDeductions || 0);
  }

  net(employee:any): number {
    return this.gross(employee) - this.deductions(employee);
  }

  processSalaries(){
    this.message = '';
    this.isProcessing = true;
    this.staffService.createPayrollRun({
      period: this.period,
      paymentDate: this.paymentDate,
      status: 'Posted',
      employees: this.employees.map((employee:any) => ({
        employeeId: employee.id,
        employeeName: employee.name,
        basicSalary: Number(employee.basicSalary || 0),
        housingAllowance: Number(employee.housingAllowance || 0),
        transportationAllowance: Number(employee.transportationAllowance || 0),
        otherAllowances: Number(employee.otherAllowances || 0),
        overtime: Number(employee.overtime || 0),
        bonus: Number(employee.bonus || 0),
        absenceDeduction: Number(employee.absenceDeduction || 0),
        lateDeduction: Number(employee.lateDeduction || 0),
        loanDeduction: Number(employee.loanDeduction || 0),
        advanceDeduction: Number(employee.advanceDeduction || 0),
        gosiEmployee: Number(employee.gosiEmployee || 0),
        gosiEmployer: Number(employee.gosiEmployer || 0),
        otherDeductions: Number(employee.otherDeductions || 0)
      }))
    }).subscribe({
      next: (run) => {
        this.payrollRuns = [run, ...this.payrollRuns];
        this.message = `Payroll posted successfully. Journal: ${run.journalEntryNo}`;
        this.isProcessing = false;
      },
      error: (error) => {
        this.message = error?.error?.message || 'Could not process payroll.';
        this.isProcessing = false;
      }
    });
  }
}

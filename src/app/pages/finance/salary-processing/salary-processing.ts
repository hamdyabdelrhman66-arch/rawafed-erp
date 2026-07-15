import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StaffService } from '../../../core/finance/staff.service';
import { FeedbackService, safeErrorMessage } from '../../../core/feedback/feedback.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { AccountingService } from '../../../core/finance/accounting.service';

@Component({
  selector:'app-salary-processing',
  standalone:true,
  imports:[
    CommonModule,
    FormsModule,
    RouterLink,
    TranslatePipe
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
  progressSteps: string[] = [];
  paymentAccounts:any[] = [];
  selectedRun:any = null;
  selectedEmployeeIds = new Set<string>();
  payForm = { paymentDate: new Date().toISOString().slice(0, 10), paymentAccountId: '', paymentMethod: 'Bank Transfer', referenceNumber: '' };

  constructor(
    private staffService: StaffService,
    private feedback: FeedbackService,
    public i18n: I18nService,
    private accounting: AccountingService,
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
    void this.accounting.getAccounts().then((accounts) => this.paymentAccounts = accounts.filter((account:any) => account.isCashAccount || account.isBankAccount));

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

  async processSalaries(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.employees.length) {
      this.feedback.validation(this.i18n.t('payroll.staff_required'));
      return;
    }
    const incomplete = this.employees.filter((employee) => !employee.name || Number(employee.basicSalary || 0) <= 0);
    if (incomplete.length) {
      this.feedback.error(this.i18n.t('payroll.process_failed'), `${incomplete.length} ${this.i18n.t('payroll.incomplete_employees')}`);
      return;
    }
    const confirmed = await this.feedback.confirm({
      title: 'Post Payroll Run?',
      message: `Payroll for ${this.period} will be posted and a salary journal will be created.`,
      confirmText: 'Post Payroll',
      tone: 'primary'
    });
    if (!confirmed) return;

    this.message = '';
    this.isProcessing = true;
    this.progressSteps = ['Validating employees', 'Calculating salary', 'Creating payroll run', 'Creating journal'];
    this.staffService.createPayrollRun({
      period: this.period,
      paymentDate: this.paymentDate,
      status: 'Processed',
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
        this.progressSteps = ['Completed'];
        this.feedback.success(this.i18n.t('payroll.processed'), `${this.i18n.t('payroll.journal_created')} ${run.journalEntryNo}`);
        this.isProcessing = false;
      },
      error: (error) => {
        this.message = safeErrorMessage(error);
        this.progressSteps = [];
        this.feedback.error(this.i18n.t('payroll.process_failed'), this.message);
        this.isProcessing = false;
      }
    });
  }

  beginPayment(run:any): void {
    this.selectedRun = run;
    this.selectedEmployeeIds = new Set((run.employees || []).filter((line:any) => line.paymentStatus !== 'PAID').map((line:any) => line.employeeId));
  }

  toggleEmployee(id:string, checked:boolean): void {
    checked ? this.selectedEmployeeIds.add(id) : this.selectedEmployeeIds.delete(id);
    this.selectedEmployeeIds = new Set(this.selectedEmployeeIds);
  }

  payPayroll(): void {
    if (!this.selectedRun || !this.payForm.paymentAccountId || !this.selectedEmployeeIds.size) {
      this.feedback.validation(this.i18n.t('error.validation_error'));
      return;
    }
    this.staffService.payPayrollRun(this.selectedRun.id, {
      ...this.payForm,
      employeeIds: [...this.selectedEmployeeIds],
      idempotencyKey: `payroll:${this.selectedRun.id}:${[...this.selectedEmployeeIds].sort().join(',')}`,
    }).subscribe({
      next: () => {
        this.feedback.success(this.i18n.t('payroll.payment_saved'));
        this.selectedRun = null;
        this.staffService.getPayrollRuns().subscribe((runs) => this.payrollRuns = runs);
      },
      error: (error) => this.feedback.error(this.i18n.t('payroll.payment_failed'), safeErrorMessage(error)),
    });
  }
}

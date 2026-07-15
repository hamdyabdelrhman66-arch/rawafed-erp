import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { PayrollRepository } from "../repositories/payroll.repository.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";
const money = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;
const shape = (r: any) => ({
  id: r.id,
  period: r.period,
  paymentDate: r.paymentDate.toISOString().slice(0, 10),
  status: r.status,
  grossTotal: Number(r.grossTotal),
  deductionsTotal: Number(r.deductionsTotal),
  employerGosiTotal: Number(r.employerGosiTotal),
  netTotal: Number(r.netTotal),
  journalEntryId: r.journalEntryId,
  journalEntryNo: r.journalEntry.entryNumber,
  payments: (r.payments || []).map((payment: any) => ({ ...payment, amount: Number(payment.amount), paymentDate: payment.paymentDate.toISOString().slice(0, 10) })),
  employees: r.lines.map((l: any) => ({
    ...l,
    basicSalary: Number(l.basicSalary),
    housingAllowance: Number(l.housingAllowance),
    transportationAllowance: Number(l.transportationAllowance),
    otherAllowances: Number(l.otherAllowances),
    overtime: Number(l.overtime),
    bonus: Number(l.bonus),
    absenceDeduction: Number(l.absenceDeduction),
    lateDeduction: Number(l.lateDeduction),
    loanDeduction: Number(l.loanDeduction),
    advanceDeduction: Number(l.advanceDeduction),
    gosiEmployee: Number(l.gosiEmployee),
    gosiEmployer: Number(l.gosiEmployer),
    otherDeductions: Number(l.otherDeductions),
    gross: Number(l.gross),
    deductions: Number(l.deductions),
    net: Number(l.net),
    paidAmount: Number(l.paidAmount || 0),
    paymentStatus: l.paymentStatus || "UNPAID",
    department: l.employee?.department,
    jobTitle: l.employee?.jobTitle || l.employee?.position,
    employeeCode: l.employee?.employeeCode,
  })),
  createdBy: r.createdById,
  createdAt: r.createdAt.toISOString(),
});
export class PayrollService {
  constructor(private readonly prisma: PrismaClient) {}
  async list() {
    return (await new PayrollRepository(this.prisma).list()).map(shape);
  }
  async create(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new PayrollRepository(tx),
        staff = await repo.staff(input.employees.map((e: any) => e.employeeId));
      if (await tx.payrollRun.findFirst({ where: { period: input.period, deletedAt: null } }))
        throw new ServiceError("A payroll batch already exists for this period.", 409, "DUPLICATE_PAYROLL_PERIOD");
      if (staff.length !== input.employees.length)
        throw new ServiceError("One or more employees were not found.", 422);
      const names = new Map(staff.map((s) => [s.id, s.name])),
        lines = input.employees.map((e: any) => {
          const gross = money(
              Number(e.basicSalary) +
                Number(e.housingAllowance || 0) +
                Number(e.transportationAllowance || 0) +
                Number(e.otherAllowances || 0) +
                Number(e.overtime || 0) +
                Number(e.bonus || 0),
            ),
            deductions = money(
              Number(e.absenceDeduction || 0) +
                Number(e.lateDeduction || 0) +
                Number(e.loanDeduction || 0) +
                Number(e.advanceDeduction || 0) +
                Number(e.gosiEmployee || 0) +
                Number(e.otherDeductions || 0),
            );
          return {
            ...e,
            id: randomUUID(),
            employeeName:
              e.employeeName || names.get(e.employeeId) || "Employee",
            gross,
            deductions,
            net: money(gross - deductions),
          };
        }),
        grossTotal = money(lines.reduce((n: number, l: any) => n + l.gross, 0)),
        deductionsTotal = money(
          lines.reduce((n: number, l: any) => n + l.deductions, 0),
        ),
        employerGosiTotal = money(
          lines.reduce(
            (n: number, l: any) => n + Number(l.gosiEmployer || 0),
            0,
          ),
        ),
        netTotal = money(lines.reduce((n: number, l: any) => n + l.net, 0)),
        salaryExpense = await repo.account("expense-salaries"),
        socialExpense = await repo.account("expense-social-insurance"),
        salaryPayable = await repo.account("salaries-payable"),
        accountsPayable = await repo.account("accounts-payable");
      if (
        !salaryExpense ||
        !salaryPayable ||
        !accountsPayable ||
        (employerGosiTotal && !socialExpense)
      )
        throw new ServiceError(
          "Payroll accounting accounts are not configured.",
          422,
        );
      const sourceId = `${input.period}:PROCESSED`,
        journal = await JournalService.postUsing(
          tx,
          {
            referenceNumber: `PAY-${input.period}`,
            postingDate: input.paymentDate,
            description: `Payroll run ${input.period}`,
            sourceType: "payroll_run",
            sourceId,
            lines: [
              { accountId: salaryExpense.id, debit: grossTotal },
              ...(employerGosiTotal
                ? [{ accountId: socialExpense!.id, debit: employerGosiTotal }]
                : []),
              { accountId: salaryPayable.id, credit: netTotal },
              ...(deductionsTotal + employerGosiTotal
                ? [
                    {
                      accountId: accountsPayable.id,
                      credit: money(deductionsTotal + employerGosiTotal),
                    },
                  ]
                : []),
            ],
          },
          actor,
        );
      const run = await repo.create(
        {
          period: input.period,
          paymentDate: new Date(input.paymentDate),
          status: "PROCESSED",
          grossTotal,
          deductionsTotal,
          employerGosiTotal,
          netTotal,
          journalEntryId: journal.id,
          createdById: actor.id,
        },
        lines,
      );
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "post payroll run",
        entityType: "payroll_run",
        entityId: run.id,
        details: { period: run.period, netTotal },
      });
      return shape(run);
    });
  }
  async pay(runId: string, input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payrollPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existingPayment) return existingPayment;
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, deletedAt: null },
        include: { journalEntry: true, lines: { include: { employee: true } }, payments: true },
      });
      if (!run) throw new ServiceError("Payroll batch was not found.", 404, "PAYROLL_NOT_FOUND");
      if (["CANCELLED", "DRAFT"].includes(run.status.toUpperCase()))
        throw new ServiceError("This payroll batch cannot be paid.", 409, "PAYROLL_NOT_PAYABLE");
      const selectedIds = Array.isArray(input.employeeIds) && input.employeeIds.length ? new Set(input.employeeIds.map(String)) : null;
      const lines = run.lines.filter((line) => (!selectedIds || selectedIds.has(line.employeeId)) && Number(line.paidAmount) < Number(line.net));
      if (!lines.length) throw new ServiceError("Selected salaries are already paid.", 409, "PAYROLL_ALREADY_PAID");
      if (selectedIds && lines.length !== selectedIds.size)
        throw new ServiceError("One or more selected salaries cannot be paid.", 422, "INVALID_PAYROLL_SELECTION");
      const amount = money(lines.reduce((sum, line) => sum + Number(line.net) - Number(line.paidAmount), 0));
      const salaryPayable = await tx.chartOfAccount.findUnique({ where: { systemKey: "salaries-payable" } });
      const paymentAccount = await tx.chartOfAccount.findFirst({
        where: { id: input.paymentAccountId, active: true, deletedAt: null, allowPosting: true, OR: [{ isCashAccount: true }, { isBankAccount: true }] },
      });
      if (!salaryPayable || !paymentAccount) throw new ServiceError("Payroll payable and payment accounts must be configured.", 422, "PAYROLL_ACCOUNT_MISSING");
      const paymentDate = new Date(input.paymentDate || Date.now());
      const journal = await JournalService.postUsing(tx, {
        postingDate: paymentDate,
        description: `Payroll payment ${run.period}`,
        referenceNumber: input.referenceNumber || `PAYROLL-${run.period}`,
        sourceType: "payroll_payment",
        sourceId: input.idempotencyKey,
        lines: [{ accountId: salaryPayable.id, debit: amount }, { accountId: paymentAccount.id, credit: amount }],
      }, actor);
      const payment = await tx.payrollPayment.create({ data: {
        payrollRunId: run.id, amount, paymentDate, paymentMethod: input.paymentMethod || "Bank Transfer",
        paymentAccountId: paymentAccount.id, referenceNumber: input.referenceNumber || null,
        employeeIds: lines.map((line) => line.employeeId), journalEntryId: journal.id,
        idempotencyKey: input.idempotencyKey, createdById: actor.id,
      } });
      for (const line of lines) await tx.payrollLine.update({ where: { id: line.id }, data: {
        paidAmount: line.net, paymentStatus: "PAID", paymentDate,
        paymentMethod: input.paymentMethod || "Bank Transfer", paymentReference: input.referenceNumber || null,
      } });
      const unpaid = await tx.payrollLine.count({ where: { payrollRunId: run.id, paymentStatus: { not: "PAID" } } });
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: unpaid ? "PARTIALLY_PAID" : "PAID" } });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "pay payroll", entityType: "payroll_payment", entityId: payment.id, details: { runId, employeeIds: lines.map((line) => line.employeeId), amount } });
      return { ...payment, amount: Number(payment.amount), journalEntryNo: journal.entryNumber };
    });
  }
}

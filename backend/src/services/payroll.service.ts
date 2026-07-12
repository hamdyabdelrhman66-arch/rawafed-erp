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
      const sourceId = `${input.period}:${input.status || "Posted"}`,
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
          status: input.status || "Posted",
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
}

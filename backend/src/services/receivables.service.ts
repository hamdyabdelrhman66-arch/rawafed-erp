import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AccountingPaymentsRepository } from "../repositories/accounting-expenses.repository.js";
import { CustomersRepository } from "../repositories/parties.repository.js";
import { InstallmentsRepository } from "../repositories/installments.repository.js";
import { LedgerRepository } from "../repositories/ledger.repository.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";

export class ReceivablesService {
  constructor(private readonly prisma: PrismaClient) {}
  async list() {
    return (await this.customerRows()).map((customer) =>
      this.shapeCustomer(customer),
    );
  }
  async get(id: string) {
    const row = (await this.customerRows(id))[0];
    if (!row) throw new ServiceError("Customer not found.", 404);
    return this.shapeCustomer(row);
  }
  async statement(id: string, from?: string, to?: string) {
    const customer = await new CustomersRepository(this.prisma).find(id);
    if (!customer) throw new ServiceError("Customer not found.", 404);
    const statement = await new (
      await import("./financial-statements.service.js")
    ).FinancialStatementsService(this.prisma).ledger(
      customer.receivableAccountId,
      from,
      to,
    );
    return {
      ...statement,
      transactions: statement.entries.map((entry: any) => ({
        ...entry,
        date: entry.postingDate,
      })),
    };
  }
  async installments(id: string) {
    await this.get(id);
    const [plans, installments] = await Promise.all([
      this.prisma.installmentPlan.findMany({
        where: { customerId: id, deletedAt: null },
        orderBy: { startDate: "desc" },
      }),
      new InstallmentsRepository(this.prisma).list(id),
    ]);
    return {
      plans: plans.map((plan) => ({
        ...plan,
        totalAmount: Number(plan.totalAmount),
        lateFeeValue: Number(plan.lateFeeValue),
        startDate: plan.startDate.toISOString().slice(0, 10),
      })),
      installments: installments.map((installment) => ({
        ...installment,
        amount: Number(installment.amount),
        paidAmount: Number(installment.paidAmount),
        dueDate: installment.dueDate.toISOString().slice(0, 10),
      })),
    };
  }
  async createPlan(customerId: string, input: any) {
    await this.get(customerId);
    const count = Number(input.installmentsCount || input.count);
    const total = Number(input.totalAmount);
    if (!Number.isInteger(count) || count <= 0 || total <= 0)
      throw new ServiceError(
        "Installment total and number of installments must be positive.",
        422,
      );
    const each = Math.floor((total * 100) / count) / 100;
    let assigned = 0;
    const start = new Date(input.startDate);
    const rows = Array.from({ length: count }, (_, i) => {
      const amount =
        i === count - 1 ? Math.round((total - assigned) * 100) / 100 : each;
      assigned += amount;
      const due = new Date(start);
      due.setMonth(due.getMonth() + i);
      return { id: randomUUID(), customerId, dueDate: due, amount };
    });
    return this.prisma.$transaction((tx) =>
      new InstallmentsRepository(tx).createPlan(
        {
          customerId,
          planType: input.planType || "monthly",
          name: input.name || "Installment Plan",
          totalAmount: total,
          startDate: start,
          installmentsCount: count,
          lateFeeType: input.lateFeeType,
          lateFeeValue: Number(input.lateFeeValue || 0),
          gracePeriodDays: Number(input.gracePeriodDays || 0),
          notes: input.notes,
        },
        rows,
      ),
    );
  }
  async payment(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await new CustomersRepository(tx).find(input.customerId);
      if (!customer) throw new ServiceError("Customer not found.", 404);
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: input.paidAt || new Date(),
          description: `Customer payment ${input.paymentNo}`,
          referenceNumber: input.paymentNo,
          sourceType: "customer_payment",
          sourceId: input.idempotencyKey || input.paymentNo,
          lines: [
            { accountId: input.paymentAccountId, debit: Number(input.amount) },
            {
              accountId: customer.receivableAccountId,
              credit: Number(input.amount),
            },
          ],
        },
        actor,
      );
      return new AccountingPaymentsRepository(tx).createCustomer({
        customerId: customer.id,
        paymentNo: input.paymentNo,
        paymentType: input.paymentType || "receipt",
        amount: Number(input.amount),
        paymentAccountId: input.paymentAccountId,
        paymentMethod: input.paymentMethod || "Cash",
        paidAt: new Date(input.paidAt || Date.now()),
        journalEntryId: journal.id,
        notes: input.notes,
      });
    });
  }

  private customerRows(id?: string) {
    return this.prisma.accountingCustomer.findMany({
      where: { id, deletedAt: null },
      include: {
        receivableAccount: true,
        student: true,
        registration: {
          include: {
            invoices: {
              where: { deletedAt: null, status: { not: "VOID" } },
              include: { lines: true },
              orderBy: { issuedAt: "desc" },
            },
            payments: {
              where: { deletedAt: null, status: "COMPLETED" },
              orderBy: { paidAt: "desc" },
            },
          },
        },
      },
      orderBy: { customerCode: "asc" },
    });
  }

  private shapeCustomer(customer: any) {
    const invoices = customer.registration?.invoices || [];
    const payments = customer.registration?.payments || [];
    const invoiceTotal = invoices.reduce(
      (sum: number, invoice: any) => sum + Number(invoice.total),
      0,
    );
    const paymentTotal = payments.reduce(
      (sum: number, payment: any) => sum + Number(payment.amount),
      0,
    );
    const balance = Math.round((invoiceTotal - paymentTotal) * 100) / 100;
    return {
      id: customer.id,
      customerCode: customer.customerCode,
      studentId: customer.studentId,
      registrationId: customer.registrationId,
      registrationNumber: customer.registrationNumber,
      parentLink: customer.parentLink,
      nameAr: customer.nameAr,
      nameEn: customer.nameEn,
      grade: customer.student?.grade,
      phone: customer.phone,
      email: customer.email,
      nationalId: customer.nationalId,
      creditLimit: Number(customer.creditLimit || 0),
      openingBalance: Number(customer.openingBalance || 0),
      receivableAccountId: customer.receivableAccountId,
      receivableCode: customer.receivableAccount.code,
      receivableNameEn: customer.receivableAccount.name,
      status: customer.active ? "active" : "inactive",
      summary: {
        currentBalance: balance,
        outstanding: Math.max(balance, 0),
        credit: Math.max(-balance, 0),
        overdue: 0,
        invoiceTotal,
        paymentTotal,
        invoicesCount: invoices.length,
        paymentsCount: payments.length,
      },
      invoices: invoices.map((invoice: any) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        feeItem: invoice.lines[0]?.description || "School Fees",
        total: Number(invoice.total),
        status: invoice.status,
        issuedAt: invoice.issuedAt.toISOString().slice(0, 10),
      })),
      payments: payments.map((payment: any) => ({
        id: payment.id,
        receiptNumber: payment.receiptNumber,
        paymentItem: "School Fees",
        amount: Number(payment.amount),
        method: payment.method,
        status: payment.status,
        paidAt: payment.paidAt.toISOString().slice(0, 10),
      })),
    };
  }
}

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
  list() {
    return new CustomersRepository(this.prisma).list();
  }
  async get(id: string) {
    const row = await new CustomersRepository(this.prisma).find(id);
    if (!row) throw new ServiceError("Customer not found.", 404);
    return row;
  }
  async statement(id: string, from?: string, to?: string) {
    const customer = await this.get(id);
    return new (
      await import("./financial-statements.service.js")
    ).FinancialStatementsService(this.prisma).ledger(
      customer.receivableAccountId,
      from,
      to,
    );
  }
  installments(id: string) {
    return new InstallmentsRepository(this.prisma).list(id);
  }
  async createPlan(customerId: string, input: any) {
    await this.get(customerId);
    const count = Number(input.installmentsCount || input.count);
    const total = Number(input.totalAmount);
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
}

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AccountingPaymentsRepository } from "../repositories/accounting-expenses.repository.js";
import { SuppliersRepository } from "../repositories/parties.repository.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";

export class PayablesService {
  constructor(private readonly prisma: PrismaClient) {}
  async list() {
    return (await new SuppliersRepository(this.prisma).list()).map((supplier) =>
      this.shapeSupplier(supplier),
    );
  }
  async get(id: string) {
    const row = await this.prisma.accountingSupplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        payableAccount: true,
        expenses: { where: { deletedAt: null }, orderBy: { expenseDate: "desc" } },
        payments: {
          where: { deletedAt: null },
          include: { paymentAccount: true, journalEntry: true },
          orderBy: { paidAt: "desc" },
        },
      },
    });
    if (!row) throw new ServiceError("Supplier not found.", 404);
    const statement = await this.statementForAccount(row.payableAccountId);
    const invoiceTotal = row.expenses.reduce(
      (sum, expense) => sum + Number(expense.totalAmount),
      0,
    );
    const paidTotal = row.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    return {
      supplier: this.shapeSupplier(row),
      summary: {
        currentBalance: Math.abs(Number(statement.closingBalance || 0)),
        invoiceTotal,
        paidTotal,
        unpaidInvoices: row.expenses.filter(
          (expense) => expense.paymentStatus !== "Paid",
        ).length,
        paymentsCount: row.payments.length,
      },
      statement: {
        ...statement,
        transactions: statement.entries.map((entry: any) => ({
          ...entry,
          date: entry.postingDate,
          referenceNumber: entry.referenceNumber,
        })),
      },
      expenses: row.expenses.map((expense) => ({
        ...expense,
        amountBeforeVat: Number(expense.amountBeforeVat),
        vatAmount: Number(expense.vatAmount),
        totalAmount: Number(expense.totalAmount),
        expenseDate: expense.expenseDate.toISOString().slice(0, 10),
      })),
      payments: row.payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
        paidAt: payment.paidAt.toISOString().slice(0, 10),
        paymentAccountCode: payment.paymentAccount.code,
        paymentAccountName: payment.paymentAccount.name,
        journalEntryNo: payment.journalEntry.entryNumber,
      })),
    };
  }
  async create(input: any) {
    const nameEn = String(input.nameEn || input.name || "").trim();
    if (!nameEn) throw new ServiceError("Supplier name is required.", 400);
    return this.prisma.$transaction(async (tx) => {
      let payableAccountId = input.payableAccountId;
      if (!payableAccountId) {
        const parent = await tx.chartOfAccount.findUnique({
          where: { systemKey: "accounts-payable" },
        });
        if (!parent)
          throw new ServiceError(
            "Accounts payable control account is not configured.",
            422,
          );
        const payable = await tx.chartOfAccount.create({
          data: {
            code: `AP-${randomUUID().slice(0, 8).toUpperCase()}`,
            name: `AP - ${nameEn}`,
            nameAr: input.nameAr ? `ذمم - ${input.nameAr}` : undefined,
            type: "LIABILITY",
            parentId: parent.id,
            normalBalance: "CREDIT",
            isPayableAccount: true,
          },
        });
        payableAccountId = payable.id;
      }
      return new SuppliersRepository(tx).create({
        supplierCode:
          input.supplierCode || `SUP-${Date.now()}-${randomUUID().slice(0, 6)}`,
        nameEn,
        nameAr: input.nameAr || undefined,
        vatNumber: input.vatNumber || undefined,
        commercialRegistration: input.commercialRegistration || undefined,
        phone: input.phone || undefined,
        email: input.email || undefined,
        address: input.address || undefined,
        city: input.city || undefined,
        contactPerson: input.contactPerson || undefined,
        paymentTerms: input.paymentTerms || undefined,
        openingBalance: Number(input.openingBalance || 0),
        payableAccountId,
        active: input.status !== "inactive",
        notes: input.notes || undefined,
      });
    });
  }
  update(id: string, input: any) {
    return new SuppliersRepository(this.prisma)
      .update(id, {
        nameEn: input.nameEn || input.name,
        nameAr: input.nameAr,
        vatNumber: input.vatNumber,
        commercialRegistration: input.commercialRegistration,
        phone: input.phone,
        email: input.email,
        address: input.address,
        city: input.city,
        contactPerson: input.contactPerson,
        paymentTerms: input.paymentTerms,
        openingBalance:
          input.openingBalance === undefined
            ? undefined
            : Number(input.openingBalance),
        payableAccountId: input.payableAccountId || undefined,
        active: input.status ? input.status === "active" : undefined,
        notes: input.notes,
      })
      .then((supplier) => this.shapeSupplier(supplier));
  }
  archive(id: string) {
    return this.prisma.$transaction((tx) =>
      new SuppliersRepository(tx).archive(id),
    );
  }
  async statement(id: string, from?: string, to?: string) {
    const supplier = await new SuppliersRepository(this.prisma).find(id);
    if (!supplier) throw new ServiceError("Supplier not found.", 404);
    return this.statementForAccount(supplier.payableAccountId, from, to);
  }
  async aging() {
    const suppliers = await this.list();
    return Promise.all(
      suppliers.map(async (supplier) => {
        const statement = await this.statement(supplier.id);
        return {
          supplierId: supplier.id,
          supplierCode: supplier.supplierCode,
          nameEn: supplier.nameEn,
          nameAr: supplier.nameAr,
          balance: Number(statement.closingBalance),
          current: Number(statement.closingBalance),
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
        };
      }),
    );
  }
  async payment(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await new SuppliersRepository(tx).find(input.supplierId);
      if (!supplier) throw new ServiceError("Supplier not found.", 404);
      const amount = Number(input.amount || 0);
      if (amount <= 0)
        throw new ServiceError("Supplier payment amount must be positive.", 422);
      const paymentAccount = await tx.chartOfAccount.findFirst({
        where: {
          id: input.paymentAccountId,
          active: true,
          deletedAt: null,
          OR: [{ isCashAccount: true }, { isBankAccount: true }],
        },
      });
      if (!paymentAccount)
        throw new ServiceError("Cash or bank payment account is required.", 422);
      const paymentNo =
        input.paymentNo || `SP-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: input.paidAt || new Date(),
          description: `Supplier payment ${paymentNo}`,
          referenceNumber: paymentNo,
          sourceType: "supplier_payment",
          sourceId: input.idempotencyKey || paymentNo,
          lines: [
            {
              accountId: supplier.payableAccountId,
              debit: amount,
            },
            { accountId: paymentAccount.id, credit: amount },
          ],
        },
        actor,
      );
      return new AccountingPaymentsRepository(tx).createSupplier({
        supplierId: supplier.id,
        paymentNo,
        paymentType: input.paymentType || "payment",
        amount,
        paymentAccountId: paymentAccount.id,
        paymentMethod: input.paymentMethod || "Cash",
        paidAt: new Date(input.paidAt || Date.now()),
        journalEntryId: journal.id,
        notes: input.notes,
      });
    });
  }

  private async statementForAccount(
    accountId: string,
    from?: string,
    to?: string,
  ) {
    return new (
      await import("./financial-statements.service.js")
    ).FinancialStatementsService(this.prisma).ledger(accountId, from, to);
  }

  private shapeSupplier(supplier: any) {
    return {
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      nameAr: supplier.nameAr,
      nameEn: supplier.nameEn,
      vatNumber: supplier.vatNumber,
      commercialRegistration: supplier.commercialRegistration,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      city: supplier.city,
      contactPerson: supplier.contactPerson,
      paymentTerms: supplier.paymentTerms,
      openingBalance: Number(supplier.openingBalance || 0),
      payableAccountId: supplier.payableAccountId,
      payableCode: supplier.payableAccount?.code,
      payableNameEn: supplier.payableAccount?.name,
      status: supplier.active ? "active" : "inactive",
      notes: supplier.notes,
    };
  }
}

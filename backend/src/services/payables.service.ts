import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AccountingPaymentsRepository } from "../repositories/accounting-expenses.repository.js";
import { SuppliersRepository } from "../repositories/parties.repository.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";

export class PayablesService {
  constructor(private readonly prisma: PrismaClient) {}
  list() {
    return new SuppliersRepository(this.prisma).list();
  }
  async get(id: string) {
    const row = await new SuppliersRepository(this.prisma).find(id);
    if (!row) throw new ServiceError("Supplier not found.", 404);
    return row;
  }
  create(input: any) {
    return new SuppliersRepository(this.prisma).create({
      ...input,
      supplierCode: input.supplierCode || `SUP-${Date.now()}`,
      nameEn: input.nameEn || input.name,
      payableAccountId: input.payableAccountId,
    });
  }
  update(id: string, input: any) {
    return new SuppliersRepository(this.prisma).update(id, input);
  }
  archive(id: string) {
    return this.prisma.$transaction((tx) =>
      new SuppliersRepository(tx).archive(id),
    );
  }
  async statement(id: string, from?: string, to?: string) {
    const supplier = await this.get(id);
    return new (
      await import("./financial-statements.service.js")
    ).FinancialStatementsService(this.prisma).ledger(
      supplier.payableAccountId,
      from,
      to,
    );
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
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: input.paidAt || new Date(),
          description: `Supplier payment ${input.paymentNo}`,
          referenceNumber: input.paymentNo,
          sourceType: "supplier_payment",
          sourceId: input.idempotencyKey || input.paymentNo,
          lines: [
            {
              accountId: supplier.payableAccountId,
              debit: Number(input.amount),
            },
            { accountId: input.paymentAccountId, credit: Number(input.amount) },
          ],
        },
        actor,
      );
      return new AccountingPaymentsRepository(tx).createSupplier({
        supplierId: supplier.id,
        paymentNo: input.paymentNo,
        paymentType: input.paymentType || "payment",
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

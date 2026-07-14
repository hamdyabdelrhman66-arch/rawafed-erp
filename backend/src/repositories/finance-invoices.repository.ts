import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class FinanceInvoicesRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(skip = 0, take = 100) {
    return this.db.financeInvoice.findMany({
      where: { deletedAt: null },
      include: {
        account: { include: { student: true, registration: true } },
        lines: { include: { revenueAccount: true } },
        payments: {
          where: { payment: { status: "COMPLETED", deletedAt: null } },
        },
      },
      orderBy: { issuedAt: "desc" },
      skip,
      take,
    });
  }
  findById(id: string) {
    return this.db.financeInvoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        account: { include: { student: true, registration: true } },
        lines: { include: { revenueAccount: true } },
        payments: {
          where: { payment: { status: "COMPLETED", deletedAt: null } },
        },
      },
    });
  }
  findByNumber(invoiceNumber: string) {
    return this.db.financeInvoice.findUnique({
      where: { invoiceNumber },
      include: {
        account: { include: { student: true, registration: true } },
        lines: { include: { revenueAccount: true } },
        payments: {
          where: { payment: { status: "COMPLETED", deletedAt: null } },
        },
      },
    });
  }
  findOpenForAccount(accountId: string) {
    return this.db.financeInvoice.findFirst({
      where: {
        accountId,
        deletedAt: null,
        status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      },
      include: {
        account: { include: { student: true, registration: true } },
        lines: { include: { revenueAccount: true } },
        payments: {
          where: { payment: { status: "COMPLETED", deletedAt: null } },
        },
      },
      orderBy: { issuedAt: "asc" },
    });
  }
  findOpenAllForAccount(accountId: string) {
    return this.db.financeInvoice.findMany({
      where: { accountId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      include: {
        account: { include: { student: true, registration: true } },
        lines: { include: { revenueAccount: true } },
        payments: { where: { payment: { status: "COMPLETED", deletedAt: null } } },
      },
      orderBy: { issuedAt: "asc" },
    });
  }
  create(
    data: Prisma.FinanceInvoiceUncheckedCreateInput,
    line: Prisma.InvoiceLineUncheckedCreateWithoutInvoiceInput,
  ) {
    return this.db.financeInvoice.create({
      data: { ...data, lines: { create: line } },
      include: {
        account: { include: { student: true, registration: true } },
        lines: { include: { revenueAccount: true } },
        payments: {
          where: { payment: { status: "COMPLETED", deletedAt: null } },
        },
      },
    });
  }
  updateStatus(
    id: string,
    status: "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID",
  ) {
    return this.db.financeInvoice.update({ where: { id }, data: { status } });
  }
}

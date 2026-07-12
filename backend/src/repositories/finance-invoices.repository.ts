import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class FinanceInvoicesRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(skip = 0, take = 100) {
    return this.db.financeInvoice.findMany({
      where: { deletedAt: null },
      include: {
        account: { include: { student: true, registration: true } },
        lines: true,
        payments: true,
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
        lines: true,
        payments: true,
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
        lines: true,
        payments: true,
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
        lines: true,
        payments: true,
      },
    });
  }
  updateStatus(id: string, status: "ISSUED" | "PARTIALLY_PAID" | "PAID") {
    return this.db.financeInvoice.update({ where: { id }, data: { status } });
  }
}

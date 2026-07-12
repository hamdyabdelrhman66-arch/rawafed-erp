import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
export class PayrollRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.payrollRun.findMany({
      where: { deletedAt: null },
      include: { journalEntry: true, lines: true },
      orderBy: { paymentDate: "desc" },
    });
  }
  create(
    data: Prisma.PayrollRunUncheckedCreateInput,
    lines: Prisma.PayrollLineUncheckedCreateWithoutPayrollRunInput[],
  ) {
    return this.db.payrollRun.create({
      data: { ...data, lines: { create: lines } },
      include: { journalEntry: true, lines: true },
    });
  }
  staff(ids: string[]) {
    return this.db.staff.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });
  }
  account(systemKey: string) {
    return this.db.chartOfAccount.findUnique({ where: { systemKey } });
  }
}

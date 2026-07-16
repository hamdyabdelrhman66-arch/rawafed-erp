import type { AccountType, Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class AccountsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(where: Prisma.ChartOfAccountWhereInput = {}) {
    return this.db.chartOfAccount.findMany({
      where: { deletedAt: null, ...where },
      include: { parent: true, costCenter: true },
      orderBy: { code: "asc" },
    });
  }
  find(id: string) {
    return this.db.chartOfAccount.findFirst({ where: { id, deletedAt: null } });
  }
  system(systemKey: string) {
    return this.db.chartOfAccount.findUnique({ where: { systemKey } });
  }
  create(data: Prisma.ChartOfAccountUncheckedCreateInput) {
    return this.db.chartOfAccount.create({ data });
  }
  update(id: string, data: Prisma.ChartOfAccountUncheckedUpdateInput) {
    return this.db.chartOfAccount.update({ where: { id }, data });
  }
  children(id: string) {
    return this.db.chartOfAccount.count({
      where: { parentId: id, deletedAt: null },
    });
  }
  lines(id: string) {
    return this.db.journalLine.count({
      where: {
        accountId: id,
        journalEntry: { status: { in: ["POSTED", "REVERSED"] }, deletedAt: null },
      },
    });
  }
  nextCode(prefix: string) {
    return this.db.chartOfAccount.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: "desc" },
      select: { code: true },
    });
  }
  byTypes(types: AccountType[]) {
    return this.list({ type: { in: types }, active: true });
  }
}

export class CostCentersRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.costCenter.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
    });
  }
  create(data: Prisma.CostCenterCreateInput) {
    return this.db.costCenter.create({ data });
  }
}

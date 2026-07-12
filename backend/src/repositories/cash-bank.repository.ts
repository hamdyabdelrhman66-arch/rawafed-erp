import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class CashBankRepository {
  constructor(private readonly db: DatabaseClient) {}
  cashboxes() {
    return this.db.cashbox.findMany({
      where: { deletedAt: null },
      include: { account: true },
    });
  }
  banks() {
    return this.db.bank.findMany({
      where: { deletedAt: null },
      include: { account: true },
    });
  }
  createCashbox(data: Prisma.CashboxUncheckedCreateInput) {
    return this.db.cashbox.create({ data, include: { account: true } });
  }
  createBank(data: Prisma.BankUncheckedCreateInput) {
    return this.db.bank.create({ data, include: { account: true } });
  }
  updateCashbox(id: string, data: Prisma.CashboxUncheckedUpdateInput) {
    return this.db.cashbox.update({
      where: { id },
      data,
      include: { account: true },
    });
  }
  updateBank(id: string, data: Prisma.BankUncheckedUpdateInput) {
    return this.db.bank.update({
      where: { id },
      data,
      include: { account: true },
    });
  }
  createTransfer(data: Prisma.CashBankTransferUncheckedCreateInput) {
    return this.db.cashBankTransfer.create({ data });
  }
}

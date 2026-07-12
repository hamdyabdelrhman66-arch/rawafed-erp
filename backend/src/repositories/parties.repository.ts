import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class CustomersRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.accountingCustomer.findMany({
      where: { deletedAt: null },
      include: { receivableAccount: true },
      orderBy: { customerCode: "asc" },
    });
  }
  find(id: string) {
    return this.db.accountingCustomer.findFirst({
      where: { id, deletedAt: null },
      include: { receivableAccount: true },
    });
  }
  upsertByStudent(
    studentId: string,
    data: Prisma.AccountingCustomerUncheckedCreateInput,
  ) {
    return this.db.accountingCustomer.upsert({
      where: { studentId },
      update: data,
      create: data,
    });
  }
}
export class SuppliersRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.accountingSupplier.findMany({
      where: { deletedAt: null },
      include: { payableAccount: true },
      orderBy: { supplierCode: "asc" },
    });
  }
  find(id: string) {
    return this.db.accountingSupplier.findFirst({
      where: { id, deletedAt: null },
      include: { payableAccount: true },
    });
  }
  create(data: Prisma.AccountingSupplierUncheckedCreateInput) {
    return this.db.accountingSupplier.create({
      data,
      include: { payableAccount: true },
    });
  }
  update(id: string, data: Prisma.AccountingSupplierUncheckedUpdateInput) {
    return this.db.accountingSupplier.update({
      where: { id },
      data,
      include: { payableAccount: true },
    });
  }
  archive(id: string) {
    return this.db.accountingSupplier.update({
      where: { id },
      data: { active: false, deletedAt: new Date() },
    });
  }
}

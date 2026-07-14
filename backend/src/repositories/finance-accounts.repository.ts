import type { DatabaseClient } from "./repository.types.js";

export class FinanceAccountsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(skip = 0, take = 100) {
    return this.db.financeAccount.findMany({
      where: { deletedAt: null },
      include: {
        registration: true,
        student: true,
        feeItems: {
          include: {
            paymentAllocations: {
              where: { payment: { status: "COMPLETED", deletedAt: null } },
            },
          },
        },
        invoices: {
          where: {
            deletedAt: null,
            status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          },
          include: {
            lines: true,
            payments: {
              where: { payment: { status: "COMPLETED", deletedAt: null } },
            },
          },
          orderBy: { issuedAt: "asc" },
        },
        payments: { where: { deletedAt: null, status: "COMPLETED" } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
  findById(id: string) {
    return this.db.financeAccount.findFirst({
      where: { id, deletedAt: null },
      include: {
        registration: true,
        student: true,
        feeItems: {
          include: {
            paymentAllocations: {
              where: { payment: { status: "COMPLETED", deletedAt: null } },
            },
          },
        },
        invoices: {
          where: {
            deletedAt: null,
            status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          },
          include: {
            lines: true,
            payments: {
              where: { payment: { status: "COMPLETED", deletedAt: null } },
            },
          },
          orderBy: { issuedAt: "asc" },
        },
        payments: { where: { deletedAt: null, status: "COMPLETED" } },
      },
    });
  }
  findByRegistrationId(registrationId: string) {
    return this.db.financeAccount.findUnique({
      where: { registrationId },
      include: {
        registration: true,
        student: true,
        feeItems: {
          include: {
            paymentAllocations: {
              where: { payment: { status: "COMPLETED", deletedAt: null } },
            },
          },
        },
        invoices: {
          where: {
            deletedAt: null,
            status: { in: ["ISSUED", "PARTIALLY_PAID"] },
          },
          include: {
            lines: true,
            payments: {
              where: { payment: { status: "COMPLETED", deletedAt: null } },
            },
          },
          orderBy: { issuedAt: "asc" },
        },
        payments: { where: { deletedAt: null, status: "COMPLETED" } },
      },
    });
  }
  async upsert(
    registrationId: string,
    studentId: string,
    expectedTotal: number,
    feeItems: Array<{ name: string; amount: number; serviceCategory?: string; subtotal?: number; vatAmount?: number }>,
  ) {
    const account = await this.db.financeAccount.upsert({
      where: { registrationId },
      update: { studentId, expectedTotal },
      create: { registrationId, studentId, expectedTotal },
    });
    await this.db.financeAccountFeeItem.deleteMany({
      where: { accountId: account.id },
    });
    if (feeItems.length)
      await this.db.financeAccountFeeItem.createMany({
        data: feeItems.map((item) => ({ ...item, accountId: account.id })),
      });
    return account;
  }
}

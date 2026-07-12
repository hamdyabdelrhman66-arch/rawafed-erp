import type { DatabaseClient } from "./repository.types.js";

export class FinancePaymentsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(skip = 0, take = 100) {
    return this.db.financePayment.findMany({
      where: { deletedAt: null },
      include: {
        account: { include: { student: true, registration: true } },
        allocations: true,
      },
      orderBy: { paidAt: "desc" },
      skip,
      take,
    });
  }
  findByReceipt(receiptNumber: string) {
    return this.db.financePayment.findUnique({ where: { receiptNumber } });
  }
  findById(id: string) {
    return this.db.financePayment.findFirst({
      where: { id, deletedAt: null },
      include: {
        account: { include: { student: true, registration: true } },
        allocations: { include: { invoice: true } },
        feeAllocations: true,
        journalEntries: { where: { deletedAt: null }, include: { lines: true } },
      },
    });
  }
  createWithAllocation(data: {
    receiptNumber: string;
    accountId: string;
    registrationId?: string;
    amount: number;
    method: string;
    referenceNumber?: string;
    notes?: string;
    paidAt: Date;
    collectedBy?: string;
    invoiceId: string;
    feeAllocations?: Array<{ feeItemId: string; amount: number }>;
  }) {
    const { invoiceId, feeAllocations = [], ...payment } = data;
    return this.db.financePayment.create({
      data: {
        ...payment,
        allocations: { create: { invoiceId, amount: payment.amount } },
        feeAllocations: { create: feeAllocations },
      },
      include: {
        account: { include: { student: true, registration: true } },
        allocations: true,
      },
    });
  }
  paidForInvoice(invoiceId: string) {
    return this.db.paymentAllocation.aggregate({
      where: { invoiceId, payment: { status: "COMPLETED", deletedAt: null } },
      _sum: { amount: true },
    });
  }
}

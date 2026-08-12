import type { DatabaseClient } from "./repository.types.js";

export class FinancePaymentsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(skip = 0, take = 100) {
    return this.db.financePayment.findMany({
      where: { deletedAt: null },
      include: {
        account: { include: { student: true, registration: true } },
        allocations: { include: { invoice: { include: { lines: true } } } },
        feeAllocations: { include: { feeItem: true } },
        receipt: true,
        taxEvents: true,
      },
      orderBy: { paidAt: "desc" },
      skip,
      take,
    });
  }
  findByReceipt(receiptNumber: string) {
    return this.db.financePayment.findUnique({ where: { receiptNumber } });
  }
  findByIdempotencyKey(idempotencyKey: string) {
    return this.db.financePayment.findUnique({
      where: { idempotencyKey },
      include: {
        account: { include: { student: true, registration: true } },
        allocations: { include: { invoice: { include: { lines: true } } } },
        feeAllocations: { include: { feeItem: true } },
        receipt: true,
        taxEvents: true,
      },
    });
  }
  findById(id: string) {
    return this.db.financePayment.findFirst({
      where: { id, deletedAt: null },
      include: {
        account: { include: { student: true, registration: true } },
        allocations: { include: { invoice: { include: { lines: true } } } },
        feeAllocations: { include: { feeItem: true } },
        journalEntries: {
          where: { deletedAt: null },
          include: { lines: { include: { account: true } } },
        },
        receipt: { include: { feeAgreement: { include: { lines: true, installments: true } } } },
        taxEvents: true,
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
    idempotencyKey?: string;
    installmentId?: string;
    invoiceId?: string;
    invoiceAllocations?: Array<{ invoiceId: string; amount: number; netAmount?: number; vatAmount?: number; governmentBorneVat?: number; discountAmount?: number }>;
    feeAllocations?: Array<{ feeItemId: string; amount: number; netAmount?: number; vatAmount?: number; governmentBorneVat?: number; discountAmount?: number }>;
  }) {
    const { invoiceId, invoiceAllocations, feeAllocations = [], ...payment } = data;
    const allocations = invoiceAllocations || (invoiceId ? [{ invoiceId, amount: payment.amount }] : []);
    return this.db.financePayment.create({
      data: {
        ...payment,
        allocations: { create: allocations },
        feeAllocations: { create: feeAllocations },
      },
      include: {
        account: { include: { student: true, registration: true } },
        allocations: { include: { invoice: { include: { lines: true } } } },
        feeAllocations: { include: { feeItem: true } },
        receipt: true,
        taxEvents: true,
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

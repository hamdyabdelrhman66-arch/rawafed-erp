import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
export class PurchaseRepository {
  constructor(private readonly db: DatabaseClient) {}
  requests() {
    return this.db.purchaseRequest.findMany({
      where: { deletedAt: null },
      include: { lines: { include: { item: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
  createRequest(
    data: Prisma.PurchaseRequestUncheckedCreateInput,
    lines: Prisma.PurchaseRequestLineUncheckedCreateWithoutRequestInput[],
  ) {
    return this.db.purchaseRequest.create({
      data: { ...data, lines: { create: lines } },
      include: { lines: true },
    });
  }
  requestStatus(id: string, status: string) {
    return this.db.purchaseRequest.update({
      where: { id },
      data: { status },
      include: { lines: true },
    });
  }
  orders() {
    return this.db.purchaseOrder.findMany({
      where: { deletedAt: null },
      include: { supplier: true, lines: { include: { item: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
  findOrder(id: string) {
    return this.db.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true, lines: true },
    });
  }
  createOrder(
    data: Prisma.PurchaseOrderUncheckedCreateInput,
    lines: Prisma.PurchaseOrderLineUncheckedCreateWithoutPurchaseOrderInput[],
  ) {
    return this.db.purchaseOrder.create({
      data: { ...data, lines: { create: lines } },
      include: { lines: true, supplier: true },
    });
  }
  orderStatus(id: string, status: string) {
    return this.db.purchaseOrder.update({
      where: { id },
      data: { status },
      include: { lines: true },
    });
  }
  receipts() {
    return this.db.goodsReceipt.findMany({
      where: { deletedAt: null },
      include: {
        supplier: true,
        warehouse: true,
        purchaseOrder: true,
        lines: { include: { item: true, movement: true } },
      },
      orderBy: { receivedDate: "desc" },
    });
  }
  createReceipt(data: Prisma.GoodsReceiptUncheckedCreateInput) {
    return this.db.goodsReceipt.create({ data });
  }
  createReceiptLine(data: Prisma.GoodsReceiptLineUncheckedCreateInput) {
    return this.db.goodsReceiptLine.create({ data });
  }
  incrementReceived(id: string, quantity: number) {
    return this.db.purchaseOrderLine.update({
      where: { id },
      data: { receivedQuantity: { increment: quantity } },
    });
  }
}

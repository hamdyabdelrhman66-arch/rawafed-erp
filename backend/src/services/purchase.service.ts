import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { PurchaseRepository } from "../repositories/purchase.repository.js";
import { StockRepository } from "../repositories/stock.repository.js";
import { NotificationService } from "./inventory-notification.service.js";
import { ServiceError } from "./service.error.js";
const money = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;
export class PurchaseService {
  constructor(private readonly prisma: PrismaClient) {}
  requests() {
    return new PurchaseRepository(this.prisma).requests();
  }
  orders() {
    return new PurchaseRepository(this.prisma).orders();
  }
  receipts() {
    return new PurchaseRepository(this.prisma).receipts();
  }
  createRequest(input: any, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const row = await new PurchaseRepository(tx).createRequest(
        {
          requestNo: input.requestNo || `PR-${Date.now()}`,
          department: input.department,
          requestedBy: input.requestedBy,
          reason: input.reason,
          priority: input.priority || "Normal",
          expectedDate: input.expectedDate
            ? new Date(input.expectedDate)
            : null,
          status: input.status || "Draft",
        },
        (input.items || []).map((line: any) => ({
          id: randomUUID(),
          itemId: line.itemId,
          quantity: Number(line.quantity),
          reason: line.reason,
        })),
      );
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create purchase request",
        entityType: "purchase_request",
        entityId: row.id,
      });
      return row;
    });
  }
  requestStatus(id: string, status: string) {
    return this.prisma.$transaction((tx) =>
      new PurchaseRepository(tx).requestStatus(id, status),
    );
  }
  createOrder(input: any, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const lines = (input.items || []).map((line: any) => {
        const quantity = Number(line.quantity),
          unitPrice = money(line.unitPrice),
          vatRate = Number(line.vatRate ?? 15),
          vatAmount = money((quantity * unitPrice * vatRate) / 100);
        return {
          id: randomUUID(),
          itemId: line.itemId,
          quantity,
          unitPrice,
          vatRate,
          vatAmount,
          total: money(quantity * unitPrice + vatAmount),
        };
      });
      const subtotal = money(
          lines.reduce((n: number, l: any) => n + l.quantity * l.unitPrice, 0),
        ),
        vatTotal = money(
          lines.reduce((n: number, l: any) => n + l.vatAmount, 0),
        );
      const row = await new PurchaseRepository(tx).createOrder(
        {
          poNumber: input.poNumber || `PO-${Date.now()}`,
          requestId: input.requestId,
          supplierId: input.supplierId,
          deliveryDate: input.deliveryDate
            ? new Date(input.deliveryDate)
            : null,
          paymentTerms: input.paymentTerms,
          status: input.status || "Draft",
          subtotal,
          vatTotal,
          total: money(subtotal + vatTotal),
        },
        lines,
      );
      if (input.requestId)
        await new PurchaseRepository(tx).requestStatus(
          input.requestId,
          "Converted to Purchase Order",
        );
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create purchase order",
        entityType: "purchase_order",
        entityId: row.id,
      });
      return row;
    });
  }
  orderStatus(id: string, status: string) {
    return this.prisma.$transaction((tx) =>
      new PurchaseRepository(tx).orderStatus(id, status),
    );
  }
  async goodsReceipt(input: any, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = new PurchaseRepository(tx),
        stock = new StockRepository(tx),
        order = input.poId ? await purchase.findOrder(input.poId) : null;
      if (input.poId && !order)
        throw new ServiceError("Purchase order not found.", 404);
      const lines = input.items?.length
        ? input.items
        : (order?.lines || []).map((line) => ({
            poLineId: line.id,
            itemId: line.itemId,
            quantity: Number(line.quantity) - Number(line.receivedQuantity),
            unitPrice: Number(line.unitPrice),
            vatRate: Number(line.vatRate),
          }));
      if (!lines.length)
        throw new ServiceError("Goods receipt requires items.", 422);
      const calculated = lines.map((line: any) => {
        const quantity = Number(line.quantity),
          unitPrice = money(line.unitPrice),
          vatRate = Number(line.vatRate ?? 15),
          vatAmount = money((quantity * unitPrice * vatRate) / 100);
        if (quantity <= 0)
          throw new ServiceError("Receipt quantity must be positive.", 422);
        return {
          ...line,
          quantity,
          unitPrice,
          vatRate,
          vatAmount,
          total: money(quantity * unitPrice + vatAmount),
        };
      });
      const subtotal = money(
          calculated.reduce(
            (n: number, l: any) => n + l.quantity * l.unitPrice,
            0,
          ),
        ),
        vatTotal = money(
          calculated.reduce((n: number, l: any) => n + l.vatAmount, 0),
        );
      const receipt = await purchase.createReceipt({
        grnNumber: input.grnNumber || `GRN-${Date.now()}`,
        purchaseOrderId: input.poId,
        supplierId: input.supplierId || order?.supplierId,
        warehouseId: input.warehouseId,
        receivedDate: new Date(input.receivedDate || Date.now()),
        supplierInvoiceNo: input.supplierInvoiceNo,
        status: "Received",
        subtotal,
        vatTotal,
        total: money(subtotal + vatTotal),
      });
      for (const line of calculated) {
        const movement = await stock.movement({
          movementNo: `MOV-${randomUUID().slice(0, 8)}`,
          movementType: "GOODS_RECEIPT",
          movementDate: new Date(input.receivedDate || Date.now()),
          itemId: line.itemId,
          warehouseId: input.warehouseId,
          quantity: line.quantity,
          unitCost: line.unitPrice,
          referenceType: "goods_receipt",
          referenceId: receipt.id,
          referenceNo: receipt.grnNumber,
        });
        await stock.increase(
          line.itemId,
          input.warehouseId,
          line.quantity,
          line.unitPrice,
        );
        await purchase.createReceiptLine({
          goodsReceiptId: receipt.id,
          purchaseOrderLineId: line.poLineId,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          vatAmount: line.vatAmount,
          total: line.total,
          movementId: movement.id,
        });
        if (line.poLineId)
          await purchase.incrementReceived(line.poLineId, line.quantity);
      }
      await stock.event({
        eventType: "GOODS_RECEIPT",
        aggregateType: "goods_receipt",
        aggregateId: receipt.id,
        referenceNo: receipt.grnNumber,
        eventDate: receipt.receivedDate,
        amount: receipt.total,
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "goods receipt",
        entityType: "goods_receipt",
        entityId: receipt.id,
      });
      await NotificationService.using(tx).create(
        `Goods receipt posted: ${receipt.grnNumber}`,
        `goods-receipt:${receipt.id}`,
      );
      return purchase
        .receipts()
        .then((rows) => rows.find((row) => row.id === receipt.id));
    });
  }
}

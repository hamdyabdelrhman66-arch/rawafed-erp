import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { InventoryRepository } from "../repositories/inventory.repository.js";
import { StockRepository } from "../repositories/stock.repository.js";
import { NotificationService } from "./inventory-notification.service.js";
import { ServiceError } from "./service.error.js";

export class StockMovementService {
  constructor(private readonly prisma: PrismaClient) {}
  list(skip?: number, take?: number) {
    return new StockRepository(this.prisma).movements(skip, take);
  }
  async create(input: any, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const items = new InventoryRepository(tx),
        stock = new StockRepository(tx),
        item = await items.findItem(input.itemId);
      if (!item) throw new ServiceError("Item not found.", 404);
      const qty = Math.abs(Number(input.quantity));
      if (qty <= 0) throw new ServiceError("Quantity must be positive.", 422);
      const type = String(input.movementType || input.type).toUpperCase();
      const inbound = [
        "STOCK IN",
        "RECEIPT",
        "ADJUSTMENT IN",
        "RETURN",
      ].includes(type);
      if (inbound)
        await stock.increase(
          item.id,
          input.warehouseId,
          qty,
          Number(input.unitCost || item.purchasePrice),
        );
      else if (
        !(await stock.decrease(
          item.id,
          input.warehouseId,
          qty,
          Boolean(input.allowNegative),
        ))
      )
        throw new ServiceError("Insufficient stock.", 422);
      const movement = await stock.movement({
        id: randomUUID(),
        movementNo:
          input.movementNo || `MOV-${Date.now()}-${randomUUID().slice(0, 6)}`,
        movementType: type,
        movementDate: new Date(input.date || Date.now()),
        itemId: item.id,
        warehouseId: input.warehouseId,
        toWarehouseId: input.toWarehouseId,
        quantity: inbound ? qty : -qty,
        unitCost: Number(input.unitCost || item.purchasePrice),
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceNo: input.referenceNo,
        reason: input.reason,
      });
      await stock.event({
        eventType: type.includes("ADJUSTMENT")
          ? "INVENTORY_ADJUSTMENT"
          : inbound
            ? "GOODS_RECEIPT"
            : "STOCK_ISSUE",
        aggregateType: "stock_movement",
        aggregateId: movement.id,
        referenceNo: movement.movementNo,
        eventDate: movement.movementDate,
        amount: qty * Number(movement.unitCost),
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "inventory stock movement",
        entityType: "stock_movement",
        entityId: movement.id,
        details: { itemId: item.id, quantity: movement.quantity.toString() },
      });
      if (!inbound) {
        const current = await stock.stock(item.id, input.warehouseId);
        if (Number(current?.quantity || 0) <= Number(item.reorderPoint))
          await NotificationService.using(tx).create(
            `Low stock: ${item.name}`,
            `low-stock:${item.id}:${input.warehouseId}`,
          );
      }
      return movement;
    });
  }
  async reverse(id: string, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new StockRepository(tx);
      const original = (await repo.movements(0, 1000)).find((m) => m.id === id);
      if (!original || original.status !== "POSTED")
        throw new ServiceError("Posted movement not found.", 404);
      const qty = Number(original.quantity);
      if (qty > 0) {
        if (!(await repo.decrease(original.itemId, original.warehouseId, qty)))
          throw new ServiceError(
            "Cannot reverse because stock was already consumed.",
            422,
          );
      } else
        await repo.increase(
          original.itemId,
          original.warehouseId,
          Math.abs(qty),
          Number(original.unitCost),
        );
      const reversal = await repo.movement({
        movementNo: `REV-${original.movementNo}`,
        movementType: "REVERSAL",
        movementDate: new Date(),
        itemId: original.itemId,
        warehouseId: original.warehouseId,
        quantity: -qty,
        unitCost: original.unitCost,
        reversedFromId: original.id,
        reason: `Reversal of ${original.movementNo}`,
      });
      await repo.reverseStatus(original.id);
      await repo.event({
        eventType: "INVENTORY_REVERSAL",
        aggregateType: "stock_movement",
        aggregateId: reversal.id,
        referenceNo: reversal.movementNo,
        eventDate: new Date(),
        amount: Math.abs(qty) * Number(original.unitCost),
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "reverse stock movement",
        entityType: "stock_movement",
        entityId: id,
      });
      return reversal;
    });
  }
}

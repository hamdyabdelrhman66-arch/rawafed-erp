import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { InventoryRepository } from "../repositories/inventory.repository.js";
import { StockRepository } from "../repositories/stock.repository.js";
import { NotificationService } from "./inventory-notification.service.js";
import { ServiceError } from "./service.error.js";
import { JournalService } from "./journal.service.js";
import { mappingFor } from "./revenue-category.js";

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
      const currentStock = await stock.stock(item.id, input.warehouseId);
      const actualUnitCost = inbound
        ? Number(input.unitCost || item.purchasePrice)
        : Number(currentStock?.averageCost || item.purchasePrice);
      if (inbound)
        await stock.increase(
          item.id,
          input.warehouseId,
          qty,
          actualUnitCost,
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
        studentId: input.studentId,
        warehouseId: input.warehouseId,
        toWarehouseId: input.toWarehouseId,
        quantity: inbound ? qty : -qty,
        unitCost: actualUnitCost,
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
      if (!inbound && ["BOOK", "UNIFORM"].includes(String(item.itemType).toUpperCase())) {
        const category = String(item.itemType).toUpperCase() === "BOOK" ? "BOOKS" : "UNIFORM";
        const mapping = await mappingFor(tx, category);
        if (!mapping.cost || !mapping.inventory)
          throw new ServiceError(`Cost and inventory accounts are required for ${category}.`, 422, "MAPPING_REQUIRED");
        const directCost = Math.round(qty * actualUnitCost * 100) / 100;
        await tx.directCostEvent.upsert({
          where: { sourceType_sourceId_category: { sourceType: "stock_movement", sourceId: movement.id, category } },
          update: {},
          create: {
            category,
            amount: directCost,
            sourceType: "stock_movement",
            sourceId: movement.id,
            studentId: input.studentId,
            invoiceId: input.invoiceId,
            eventDate: movement.movementDate,
            notes: input.reason || `Issued ${item.name}`,
          },
        });
        await JournalService.postUsing(tx, {
          postingDate: movement.movementDate,
          description: `${category} cost recognition ${movement.movementNo}`,
          referenceNumber: movement.movementNo,
          sourceType: "inventory_cost",
          sourceId: movement.id,
          lines: [
            { accountId: mapping.cost.id, debit: directCost, costCenterId: mapping.costCenterId || undefined },
            { accountId: mapping.inventory.id, credit: directCost, costCenterId: mapping.costCenterId || undefined },
          ],
        }, actor);
      }
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
      const costEvent = await tx.directCostEvent.findFirst({
        where: { sourceType: "stock_movement", sourceId: original.id },
      });
      if (costEvent) {
        await tx.directCostEvent.upsert({
          where: { sourceType_sourceId_category: { sourceType: "stock_reversal", sourceId: reversal.id, category: costEvent.category } },
          update: {},
          create: {
            category: costEvent.category,
            amount: -Number(costEvent.amount),
            sourceType: "stock_reversal",
            sourceId: reversal.id,
            studentId: costEvent.studentId,
            invoiceId: costEvent.invoiceId,
            eventDate: reversal.movementDate,
            notes: `Reversal of ${original.movementNo}`,
          },
        });
        const originalJournal = await tx.journalEntry.findFirst({
          where: { sourceType: "inventory_cost", sourceId: original.id, deletedAt: null },
        });
        if (originalJournal)
          await JournalService.reverseUsing(tx, originalJournal.id, actor, "inventory_cost_reversal");
      }
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

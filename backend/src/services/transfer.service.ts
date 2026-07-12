import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { StockRepository } from "../repositories/stock.repository.js";
import { TransferRepository } from "../repositories/transfer.repository.js";
import { NotificationService } from "./inventory-notification.service.js";
import { ServiceError } from "./service.error.js";
export class TransferService {
  constructor(private readonly prisma: PrismaClient) {}
  list() {
    return new TransferRepository(this.prisma).list();
  }
  create(input: any, actor: Actor = {}) {
    if (input.fromWarehouseId === input.toWarehouseId)
      throw new ServiceError("Transfer warehouses must differ.", 422);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await new TransferRepository(tx).create({
        transferNumber: input.transferNumber || `TRF-${Date.now()}`,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        transferDate: new Date(input.transferDate || Date.now()),
        notes: input.notes,
      });
      for (const line of input.items || []) {
        const quantity = Number(line.quantity);
        if (
          !(await new StockRepository(tx).decrease(
            line.itemId,
            input.fromWarehouseId,
            quantity,
          ))
        )
          throw new ServiceError("Insufficient stock for transfer.", 422);
        const source = await new StockRepository(tx).stock(
          line.itemId,
          input.fromWarehouseId,
        );
        await new StockRepository(tx).increase(
          line.itemId,
          input.toWarehouseId,
          quantity,
          Number(source?.averageCost || 0),
        );
        const movement = await new StockRepository(tx).movement({
          movementNo: `MOV-${randomUUID().slice(0, 8)}`,
          movementType: "STOCK_TRANSFER",
          movementDate: transfer.transferDate,
          itemId: line.itemId,
          warehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          quantity: -quantity,
          unitCost: Number(source?.averageCost || 0),
          referenceType: "stock_transfer",
          referenceId: transfer.id,
          referenceNo: transfer.transferNumber,
        });
        await new TransferRepository(tx).line({
          transferId: transfer.id,
          itemId: line.itemId,
          quantity,
          movementId: movement.id,
        });
      }
      await new StockRepository(tx).event({
        eventType: "STOCK_TRANSFER",
        aggregateType: "stock_transfer",
        aggregateId: transfer.id,
        referenceNo: transfer.transferNumber,
        eventDate: transfer.transferDate,
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "stock transfer",
        entityType: "stock_transfer",
        entityId: transfer.id,
      });
      await NotificationService.using(tx).create(
        `Stock transfer posted: ${transfer.transferNumber}`,
        `stock-transfer:${transfer.id}`,
      );
      return transfer;
    });
  }
}

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { InventoryCountRepository } from "../repositories/inventory-count.repository.js";
import { StockRepository } from "../repositories/stock.repository.js";
export class InventoryCountService {
  constructor(private readonly prisma: PrismaClient) {}
  list() {
    return new InventoryCountRepository(this.prisma).list();
  }
  create(input: any, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const lines = [];
      for (const item of input.items || []) {
        const stock = await new StockRepository(tx).stock(
            item.itemId,
            input.warehouseId,
          ),
          expected = Number(stock?.quantity || 0),
          counted = Number(item.countedQuantity);
        lines.push({
          id: randomUUID(),
          itemId: item.itemId,
          expectedQuantity: expected,
          countedQuantity: counted,
          variance: counted - expected,
        });
      }
      const count = await new InventoryCountRepository(tx).create(
        {
          countNumber: input.countNumber || `CNT-${Date.now()}`,
          warehouseId: input.warehouseId,
          countDate: new Date(input.countDate || Date.now()),
          status: "Draft",
        },
        lines,
      );
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "inventory count",
        entityType: "inventory_count",
        entityId: count.id,
      });
      return count;
    });
  }
}

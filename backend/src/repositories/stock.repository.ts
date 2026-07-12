import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
export class StockRepository {
  constructor(private readonly db: DatabaseClient) {}
  movements(skip = 0, take = 100) {
    return this.db.stockMovement.findMany({
      where: { deletedAt: null },
      include: { item: true, warehouse: true, toWarehouse: true },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    });
  }
  stock(itemId: string, warehouseId: string) {
    return this.db.inventoryStock.findUnique({
      where: { stockKey: `${itemId}:${warehouseId}:DEFAULT` },
    });
  }
  increase(
    itemId: string,
    warehouseId: string,
    quantity: number,
    unitCost: number,
  ) {
    const stockKey = `${itemId}:${warehouseId}:DEFAULT`;
    return this.db.inventoryStock.upsert({
      where: { stockKey },
      update: { quantity: { increment: quantity }, averageCost: unitCost },
      create: {
        stockKey,
        itemId,
        warehouseId,
        quantity,
        averageCost: unitCost,
      },
    });
  }
  async decrease(
    itemId: string,
    warehouseId: string,
    quantity: number,
    allowNegative = false,
  ) {
    const result = await this.db.inventoryStock.updateMany({
      where: {
        stockKey: `${itemId}:${warehouseId}:DEFAULT`,
        ...(!allowNegative ? { quantity: { gte: quantity } } : {}),
      },
      data: { quantity: { decrement: quantity } },
    });
    return result.count === 1;
  }
  movement(data: Prisma.StockMovementUncheckedCreateInput) {
    return this.db.stockMovement.create({ data });
  }
  event(data: Prisma.InventoryAccountingEventCreateInput) {
    return this.db.inventoryAccountingEvent.create({ data });
  }
  reverseStatus(id: string) {
    return this.db.stockMovement.update({
      where: { id },
      data: { status: "REVERSED" },
    });
  }
}

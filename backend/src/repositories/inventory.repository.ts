import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
export class InventoryRepository {
  constructor(private readonly db: DatabaseClient) {}
  categories() {
    return this.db.inventoryCategory.findMany({
      where: { deletedAt: null },
      include: { parent: true },
      orderBy: { code: "asc" },
    });
  }
  units() {
    return this.db.unitOfMeasure.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
    });
  }
  items(skip = 0, take = 100) {
    return this.db.inventoryItem.findMany({
      where: { deletedAt: null },
      include: {
        category: true,
        unit: true,
        defaultWarehouse: true,
        supplier: true,
        stock: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
  findItem(id: string) {
    return this.db.inventoryItem.findFirst({
      where: { id, deletedAt: null },
      include: { category: true, unit: true, stock: true },
    });
  }
  createItem(data: Prisma.InventoryItemUncheckedCreateInput) {
    return this.db.inventoryItem.create({ data });
  }
  updateItem(id: string, data: Prisma.InventoryItemUncheckedUpdateInput) {
    return this.db.inventoryItem.update({ where: { id }, data });
  }
  settings() {
    return this.db.inventorySetting.findMany();
  }
  setting(key: string, value: string) {
    return this.db.inventorySetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

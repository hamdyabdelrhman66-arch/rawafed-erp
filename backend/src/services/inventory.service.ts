import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { InventoryRepository } from "../repositories/inventory.repository.js";
import { StockRepository } from "../repositories/stock.repository.js";
import { ServiceError } from "./service.error.js";
export class InventoryService {
  constructor(private readonly prisma: PrismaClient) {}
  categories() {
    return new InventoryRepository(this.prisma).categories();
  }
  units() {
    return new InventoryRepository(this.prisma).units();
  }
  items(skip?: number, take?: number) {
    return new InventoryRepository(this.prisma).items(skip, take);
  }
  async create(input: any, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new InventoryRepository(tx);
      const item = await repo.createItem({
        itemCode: input.itemCode || `ITM-${Date.now()}`,
        name: input.nameEn,
        nameAr: input.nameAr,
        categoryId: input.categoryId,
        unitId: input.unitId,
        itemType:
          input.itemType ||
          String(input.category || "CONSUMABLE").toUpperCase(),
        barcode: input.barcode,
        purchasePrice: Number(input.purchasePrice || 0),
        sellingPrice: Number(input.sellingPrice || 0),
        taxable: input.taxable !== false,
        vatRate: Number(input.vatRate ?? 15),
        minimumStock: Number(input.minimumStock || 0),
        maximumStock: Number(input.maximumStock || 0),
        reorderPoint: Number(input.reorderPoint || input.minimumStock || 0),
        defaultWarehouseId: input.defaultWarehouseId,
        supplierId: input.supplierId,
        description: input.description,
      });
      const opening = Number(input.openingQuantity || 0);
      if (opening) {
        if (!input.defaultWarehouseId)
          throw new ServiceError(
            "Default warehouse is required for opening stock.",
            422,
          );
        await new StockRepository(tx).increase(
          item.id,
          input.defaultWarehouseId,
          opening,
          Number(input.purchasePrice || 0),
        );
      }
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create inventory item",
        entityType: "inventory_item",
        entityId: item.id,
      });
      return item;
    });
  }
  update(id: string, input: any) {
    return this.prisma.$transaction((tx) =>
      new InventoryRepository(tx).updateItem(id, {
        name: input.nameEn,
        nameAr: input.nameAr,
        categoryId: input.categoryId,
        unitId: input.unitId,
        itemType: input.itemType,
        barcode: input.barcode,
        purchasePrice: input.purchasePrice,
        sellingPrice: input.sellingPrice,
        taxable: input.taxable,
        vatRate: input.vatRate,
        minimumStock: input.minimumStock,
        maximumStock: input.maximumStock,
        reorderPoint: input.reorderPoint,
        defaultWarehouseId: input.defaultWarehouseId,
        supplierId: input.supplierId,
        description: input.description,
        active: input.status ? input.status === "active" : undefined,
      }),
    );
  }
}

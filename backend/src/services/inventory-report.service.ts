import type { PrismaClient } from "@prisma/client";
import { InventoryRepository } from "../repositories/inventory.repository.js";
import { PurchaseRepository } from "../repositories/purchase.repository.js";
import { StockRepository } from "../repositories/stock.repository.js";
import { WarehouseRepository } from "../repositories/warehouse.repository.js";
export class InventoryReportService {
  constructor(private readonly prisma: PrismaClient) {}
  async reports() {
    const [items, movements, warehouses, orders] = await Promise.all([
      new InventoryRepository(this.prisma).items(0, 10000),
      new StockRepository(this.prisma).movements(0, 10000),
      new WarehouseRepository(this.prisma).list(),
      new PurchaseRepository(this.prisma).orders(),
    ]);
    const valuation = items.map((item) => ({
      itemId: item.id,
      itemCode: item.itemCode,
      nameEn: item.name,
      itemType: item.itemType,
      quantity: item.stock.reduce((n, s) => n + Number(s.quantity), 0),
      value: item.stock.reduce(
        (n, s) => n + Number(s.quantity) * Number(s.averageCost),
        0,
      ),
    }));
    const moved = new Set(movements.map((m) => m.itemId));
    return {
      inventoryValuation: valuation,
      stockMovement: movements,
      lowStock: valuation.filter(
        (row, i) => row.quantity <= Number(items[i].reorderPoint),
      ),
      deadStock: valuation.filter(
        (row) => row.quantity > 0 && !moved.has(row.itemId),
      ),
      warehouseSummary: warehouses.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        quantity: w.stock.reduce((n, s) => n + Number(s.quantity), 0),
        value: w.stock.reduce(
          (n, s) => n + Number(s.quantity) * Number(s.averageCost),
          0,
        ),
      })),
      supplierSummary: orders.reduce((all: any[], order) => {
        const row = all.find((x) => x.supplierId === order.supplierId);
        if (row) {
          row.orders++;
          row.total += Number(order.total);
        } else
          all.push({
            supplierId: order.supplierId,
            supplierName: order.supplier.nameEn,
            orders: 1,
            total: Number(order.total),
          });
        return all;
      }, []),
      purchaseSummary: orders,
      bookInventory: valuation.filter((_, i) => items[i].itemType === "BOOK"),
      uniformInventory: valuation.filter(
        (_, i) => items[i].itemType === "UNIFORM",
      ),
    };
  }
  async dashboard() {
    const r = await this.reports();
    return {
      totalItems: r.inventoryValuation.length,
      totalValue: r.inventoryValuation.reduce((n, r) => n + r.value, 0),
      lowStockCount: r.lowStock.length,
      deadStockCount: r.deadStock.length,
      warehouses: r.warehouseSummary,
    };
  }
}

import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
export class WarehouseRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.warehouse.findMany({
      where: { deletedAt: null },
      include: { locations: true, stock: true },
      orderBy: { code: "asc" },
    });
  }
  find(id: string) {
    return this.db.warehouse.findFirst({ where: { id, deletedAt: null } });
  }
  create(data: Prisma.WarehouseUncheckedCreateInput) {
    return this.db.warehouse.create({ data });
  }
  update(id: string, data: Prisma.WarehouseUncheckedUpdateInput) {
    return this.db.warehouse.update({ where: { id }, data });
  }
  createLocation(data: Prisma.WarehouseLocationUncheckedCreateInput) {
    return this.db.warehouseLocation.create({ data });
  }
}

import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
export class InventoryCountRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.inventoryCount.findMany({
      where: { deletedAt: null },
      include: { warehouse: true, lines: { include: { item: true } } },
      orderBy: { countDate: "desc" },
    });
  }
  create(
    data: Prisma.InventoryCountUncheckedCreateInput,
    lines: Prisma.InventoryCountLineUncheckedCreateWithoutCountInput[],
  ) {
    return this.db.inventoryCount.create({
      data: { ...data, lines: { create: lines } },
      include: { lines: true },
    });
  }
}

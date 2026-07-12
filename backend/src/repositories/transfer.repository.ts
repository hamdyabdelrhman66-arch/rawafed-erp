import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
export class TransferRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.stockTransfer.findMany({
      where: { deletedAt: null },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        lines: { include: { item: true, movement: true } },
      },
      orderBy: { transferDate: "desc" },
    });
  }
  create(data: Prisma.StockTransferUncheckedCreateInput) {
    return this.db.stockTransfer.create({ data });
  }
  line(data: Prisma.StockTransferLineUncheckedCreateInput) {
    return this.db.stockTransferLine.create({ data });
  }
}

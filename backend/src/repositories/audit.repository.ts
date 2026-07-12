import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class AuditRepository {
  constructor(private readonly db: DatabaseClient) {}
  create(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.db.auditLog.create({ data });
  }
  findByIdempotencyKey(idempotencyKey: string) {
    return this.db.auditLog.findUnique({ where: { idempotencyKey } });
  }
  list(skip = 0, take = 100) {
    return this.db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
}

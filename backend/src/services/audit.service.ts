import type { Prisma } from "@prisma/client";
import { AuditRepository } from "../repositories/audit.repository.js";
import type { DatabaseClient } from "../repositories/repository.types.js";

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}
  static using(db: DatabaseClient) {
    return new AuditService(new AuditRepository(db));
  }
  record(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.repository.create(data);
  }
}

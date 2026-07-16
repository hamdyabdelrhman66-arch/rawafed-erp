import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
import { auditHash, sanitizeAuditValue } from "../security/security-utils.js";

export type AuditCreateInput = Omit<Prisma.AuditLogUncheckedCreateInput, "recordHash"> & { recordHash?: string };

export class AuditRepository {
  constructor(private readonly db: DatabaseClient) {}
  async create(input: AuditCreateInput) {
    const actor = input.actorId
      ? await this.db.user.findUnique({ where: { id: input.actorId }, include: { role: true } })
      : null;
    const previous = await this.db.auditLog.findFirst({ orderBy: { createdAt: "desc" }, select: { recordHash: true } });
    const sanitized = {
      ...input,
      usernameSnapshot: input.usernameSnapshot || actor?.username,
      displayNameSnapshot: input.displayNameSnapshot || actor?.displayName,
      roleSnapshot: input.roleSnapshot || input.actorRole || actor?.role.name,
      status: input.status || "SUCCESS",
      riskLevel: input.riskLevel || "LOW",
      source: input.source || "WEB",
      oldValues: sanitizeAuditValue(input.oldValues) as Prisma.InputJsonValue | undefined,
      newValues: sanitizeAuditValue(input.newValues) as Prisma.InputJsonValue | undefined,
      changedFields: sanitizeAuditValue(input.changedFields) as Prisma.InputJsonValue | undefined,
      details: sanitizeAuditValue(input.details) as Prisma.InputJsonValue | undefined,
      previousRecordHash: input.previousRecordHash || previous?.recordHash,
    };
    const persisted = JSON.parse(JSON.stringify(sanitized)) as Prisma.AuditLogUncheckedCreateInput;
    const recordHash = input.recordHash || auditHash(persisted as unknown as Record<string, unknown>);
    return this.db.auditLog.create({ data: { ...persisted, recordHash } });
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

import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AdminRepository } from "../repositories/admin.repository.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { NotificationsRepository } from "../repositories/notifications.repository.js";
export class AdminService {
  constructor(private readonly prisma: PrismaClient) {}
  exportAll() {
    return new AdminRepository(this.prisma).exportAll();
  }
  async integrity() {
    return {
      generatedAt: new Date().toISOString(),
      database: { engine: "prisma/postgresql", persistent: true, warning: "" },
      ...(await new AdminRepository(this.prisma).integrity()),
    };
  }
  announcement(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const note = await new NotificationsRepository(tx).create({
        message: input.message,
        targetRoles: input.targetRoles || "all",
        category: "admin",
        readBy: [],
        link: input.link,
        sourceId: `admin-announcement:${crypto.randomUUID()}`,
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "admin announcement",
        entityType: "notification",
        entityId: note.id,
      });
      return {
        ...note,
        createdAt: note.createdAt.toISOString(),
        updatedAt: undefined,
        deletedAt: undefined,
      };
    });
  }
}

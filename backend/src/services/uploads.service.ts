import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { UploadsRepository } from "../repositories/uploads.repository.js";

export class UploadsService {
  constructor(private readonly prisma: PrismaClient) {}
  async create(
    data: {
      id: string;
      originalName: string;
      fileName: string;
      mimeType: string;
      size: number;
      url: string;
      label?: string;
      ownerId?: string;
      uploadedBy?: string;
    },
    actor?: Actor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await new UploadsRepository(tx).create(data);
      await new AuditRepository(tx).create({
        actorId: actor?.id,
        actorRole: actor?.role,
        action: actor ? "upload document" : "public upload document",
        entityType: "upload",
        entityId: row.id,
        details: { label: row.label, mimeType: row.mimeType },
      });
      return {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: undefined,
        deletedAt: undefined,
      };
    });
  }
  async remove(id: string, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      await new UploadsRepository(tx).softDelete(id);
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "delete upload",
        entityType: "upload",
        entityId: id,
      });
    });
  }
}

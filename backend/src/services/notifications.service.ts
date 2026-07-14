import type { PrismaClient } from "@prisma/client";
import { NotificationsRepository } from "../repositories/notifications.repository.js";

export class NotificationsService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(role: string, userId: string, skip?: number, take?: number) {
    return (await new NotificationsRepository(this.prisma).list(skip, take, userId))
      .filter(
        (n) =>
          n.targetRoles === "all" ||
          (Array.isArray(n.targetRoles) && n.targetRoles.includes(role)),
      )
      .map((n) => ({
        ...n,
        read: Boolean((n as any).reads?.length) || (Array.isArray(n.readBy) && n.readBy.map(String).includes(userId)),
        reads: undefined,
        createdAt: n.createdAt.toISOString(),
        updatedAt: undefined,
        deletedAt: undefined,
      }));
  }
  async markRead(id: string, role: string, userId: string) {
    const repo = new NotificationsRepository(this.prisma);
    const rows = await repo.list(0, 1000, userId);
    const note = rows.find((n) => n.id === id);
    if (!note) return;
    const visible =
      note.targetRoles === "all" ||
      (Array.isArray(note.targetRoles) && note.targetRoles.includes(role));
    if (!visible) return;
    await repo.markRead(id, userId);
  }
  async markAllRead(role: string, userId: string) {
    const rows = await new NotificationsRepository(this.prisma).list(0, 1000, userId);
    const visible = rows.filter((note) =>
      note.targetRoles === "all" ||
      (Array.isArray(note.targetRoles) && note.targetRoles.includes(role)),
    );
    await new NotificationsRepository(this.prisma).markAllRead(visible.map((note) => note.id), userId);
    return { updated: visible.length };
  }
}

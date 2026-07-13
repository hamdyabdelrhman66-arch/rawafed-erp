import type { PrismaClient } from "@prisma/client";
import { NotificationsRepository } from "../repositories/notifications.repository.js";

export class NotificationsService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(role: string, skip?: number, take?: number) {
    return (await new NotificationsRepository(this.prisma).list(skip, take))
      .filter(
        (n) =>
          n.targetRoles === "all" ||
          (Array.isArray(n.targetRoles) && n.targetRoles.includes(role)),
      )
      .map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        updatedAt: undefined,
        deletedAt: undefined,
      }));
  }
  async markRead(id: string, role: string, userId: string) {
    const repo = new NotificationsRepository(this.prisma);
    const rows = await repo.list(0, 1000);
    const note = rows.find((n) => n.id === id);
    if (!note) return;
    const visible =
      note.targetRoles === "all" ||
      (Array.isArray(note.targetRoles) && note.targetRoles.includes(role));
    if (!visible) return;
    const readBy = Array.isArray(note.readBy) ? note.readBy.map(String) : [];
    if (!readBy.includes(userId))
      await repo.updateReadBy(id, [...readBy, userId]);
  }
}

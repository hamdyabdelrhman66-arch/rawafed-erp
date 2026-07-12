import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class NotificationsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(skip = 0, take = 100) {
    return this.db.notification.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
  create(data: Prisma.NotificationUncheckedCreateInput) {
    return this.db.notification.create({ data });
  }
  findBySourceId(sourceId: string) {
    return this.db.notification.findFirst({
      where: { sourceId, deletedAt: null },
    });
  }
  updateReadBy(id: string, readBy: Prisma.InputJsonValue) {
    return this.db.notification.update({ where: { id }, data: { readBy } });
  }
}

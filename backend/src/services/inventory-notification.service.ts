import type { DatabaseClient } from "../repositories/repository.types.js";
import { NotificationsRepository } from "../repositories/notifications.repository.js";
export class NotificationService {
  constructor(private readonly repository: NotificationsRepository) {}
  static using(db: DatabaseClient) {
    return new NotificationService(new NotificationsRepository(db));
  }
  create(message: string, sourceId: string, link = "/finance/inventory") {
    return this.repository.create({
      message,
      targetRoles: ["Finance", "Finance Manager", "Super Admin"],
      category: "finance",
      readBy: [],
      link,
      sourceId,
    });
  }
}

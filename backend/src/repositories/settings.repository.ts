import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class SettingsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.setting.findMany();
  }
  upsert(key: string, value: Prisma.InputJsonValue) {
    return this.db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

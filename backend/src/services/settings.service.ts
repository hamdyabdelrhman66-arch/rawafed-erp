import { Prisma, type PrismaClient } from "@prisma/client";
import { SettingsRepository } from "../repositories/settings.repository.js";

export class SettingsService {
  constructor(private readonly repository: SettingsRepository) {}
  static using(prisma: PrismaClient) {
    return new SettingsService(new SettingsRepository(prisma));
  }
  async get() {
    return Object.fromEntries(
      (await this.repository.list()).map((row) => [row.key, row.value]),
    );
  }
  async update(values: Record<string, unknown>) {
    await Promise.all(
      Object.entries(values).map(([key, value]) =>
        this.repository.upsert(key, value as Prisma.InputJsonValue),
      ),
    );
    return this.get();
  }
}

import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class ReportTemplateRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(userId: string) {
    return this.db.reportTemplate.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
  }
  save(
    userId: string,
    input: {
      name: string;
      reportType: string;
      filters?: Prisma.InputJsonValue;
      columns?: Prisma.InputJsonValue;
      groupBy?: string;
      sortBy?: string;
      chartType?: string;
    },
  ) {
    return this.db.reportTemplate.upsert({
      where: { userId_name: { userId, name: input.name } },
      update: input,
      create: { userId, ...input },
    });
  }
  remove(userId: string, id: string) {
    return this.db.reportTemplate.deleteMany({ where: { id, userId } });
  }
}

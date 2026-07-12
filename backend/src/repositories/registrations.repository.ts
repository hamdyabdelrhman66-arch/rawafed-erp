import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class RegistrationsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(skip = 0, take = 100) {
    return this.db.registration.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
  findById(id: string) {
    return this.db.registration.findFirst({ where: { id, deletedAt: null } });
  }
  findByNumber(registrationNumber: string) {
    return this.db.registration.findUnique({ where: { registrationNumber } });
  }
  latestNumber(prefix: string) {
    return this.db.registration.findFirst({
      where: { registrationNumber: { startsWith: prefix } },
      orderBy: { registrationNumber: "desc" },
      select: { registrationNumber: true },
    });
  }
  create(data: Prisma.RegistrationUncheckedCreateInput) {
    return this.db.registration.create({ data });
  }
  updateStatus(id: string, status: string) {
    return this.db.registration.update({ where: { id }, data: { status } });
  }
}

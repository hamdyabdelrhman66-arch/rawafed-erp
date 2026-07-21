import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class StudentsRepository {
  constructor(private readonly db: DatabaseClient) {}
  list(skip = 0, take = 100, includeArchived = false) {
    return this.db.student.findMany({
      where: includeArchived ? {} : { deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
  findById(id: string) {
    return this.db.student.findFirst({ where: { id, deletedAt: null } });
  }
  findByIdIncludingArchived(id: string) {
    return this.db.student.findUnique({ where: { id } });
  }
  findByRegistrationId(registrationId: string) {
    return this.db.student.findUnique({ where: { registrationId } });
  }
  upsertForRegistration(
    registrationId: string,
    data: Omit<Prisma.StudentUncheckedCreateInput, "registrationId">,
  ) {
    return this.db.student.upsert({
      where: { registrationId },
      update: { ...data, id: undefined },
      create: { ...data, registrationId },
    });
  }
  update(id: string, data: Prisma.StudentUpdateInput) {
    return this.db.student.update({ where: { id }, data });
  }
  archive(id: string) {
    return this.db.student.update({
      where: { id },
      data: { status: "archived", deletedAt: new Date() },
    });
  }
  restore(id: string) {
    return this.db.student.update({ where: { id }, data: { status: "active", deletedAt: null } });
  }
  financeReferences(id: string) {
    return this.db.financeAccount.count({
      where: { studentId: id, deletedAt: null },
    });
  }
}

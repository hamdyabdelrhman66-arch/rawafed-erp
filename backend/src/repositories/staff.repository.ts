import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";
export class StaffRepository {
  constructor(private readonly db: DatabaseClient) {}
  list() {
    return this.db.staff.findMany({
      where: { deletedAt: null },
      include: { branch: true },
      orderBy: { createdAt: "desc" },
    });
  }
  find(id: string) {
    return this.db.staff.findFirst({
      where: { id, deletedAt: null },
      include: { branch: true },
    });
  }
  create(data: Prisma.StaffUncheckedCreateInput) {
    return this.db.staff.create({ data, include: { branch: true } });
  }
  update(id: string, data: Prisma.StaffUncheckedUpdateInput) {
    return this.db.staff.update({
      where: { id },
      data,
      include: { branch: true },
    });
  }
  archive(id: string) {
    return this.db.staff.update({
      where: { id },
      data: { status: "Archived", deletedAt: new Date() },
    });
  }
  activeBranch() {
    return this.db.branch.findFirst({
      where: { active: true, deletedAt: null },
    });
  }
}

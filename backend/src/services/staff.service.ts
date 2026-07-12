import type { Prisma, PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { StaffRepository } from "../repositories/staff.repository.js";
import { ServiceError } from "./service.error.js";
const money = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;
const shape = (row: any) => ({
  ...row.profile,
  id: row.id,
  name: row.name,
  position: row.position,
  department: row.department,
  phone: row.phone,
  email: row.email,
  salary: Number(row.salary),
  startDate: row.startDate?.toISOString().slice(0, 10),
  nationality: row.nationality,
  idNumber: row.idNumber,
  status: row.status,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
export class StaffService {
  constructor(private readonly prisma: PrismaClient) {}
  async list() {
    return (await new StaffRepository(this.prisma).list()).map(shape);
  }
  async create(input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new StaffRepository(tx),
        branch = await repo.activeBranch();
      if (!branch)
        throw new ServiceError("Active branch is not configured.", 422);
      const base = money(input.basicSalary ?? input.salary),
        salary = money(
          base +
            Number(input.housingAllowance || 0) +
            Number(input.transportationAllowance || 0) +
            Number(input.otherAllowances || 0),
        );
      const row = await repo.create({
        branchId: branch.id,
        name: input.name,
        position: input.position,
        department: input.department,
        phone: input.mobile || input.phone,
        email: input.email || null,
        salary,
        startDate:
          input.startDate || input.joiningDate
            ? new Date(input.startDate || input.joiningDate)
            : null,
        nationality: input.nationality,
        idNumber: input.idNumber || input.nationalId,
        status: input.status || "Active",
        notes: input.notes,
        profile: input as Prisma.InputJsonValue,
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create staff",
        entityType: "staff",
        entityId: row.id,
      });
      return shape(row);
    });
  }
  async update(id: string, input: any, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new StaffRepository(tx),
        current = await repo.find(id);
      if (!current) throw new ServiceError("Staff member not found.", 404);
      const profile = {
        ...(current.profile as object),
        ...input,
      } as Prisma.InputJsonValue;
      const row = await repo.update(id, {
        name: input.name,
        position: input.position,
        department: input.department,
        phone: input.mobile ?? input.phone,
        email: input.email,
        salary: input.salary === undefined ? undefined : money(input.salary),
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        nationality: input.nationality,
        idNumber: input.idNumber ?? input.nationalId,
        status: input.status,
        notes: input.notes,
        profile,
      });
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "update staff",
        entityType: "staff",
        entityId: id,
      });
      return shape(row);
    });
  }
  async archive(id: string, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      await new StaffRepository(tx).archive(id);
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "archive staff",
        entityType: "staff",
        entityId: id,
      });
    });
  }
}

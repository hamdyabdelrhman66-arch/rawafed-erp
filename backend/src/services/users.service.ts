import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { AuthRepository } from "../repositories/auth.repository.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { UsersRepository } from "../repositories/users.repository.js";
import type { Actor } from "../dto/core.dto.js";
import { ServiceError } from "./service.error.js";
import { validateNewPassword } from "../security/password-policy.js";

const shape = (u: any) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  displayName: u.displayName,
  employeeCode: u.employeeCode,
  phone: u.phone,
  department: u.department,
  jobTitle: u.jobTitle,
  role: u.role.name,
  active: u.active,
  createdAt: u.createdAt.toISOString(),
  updatedAt: u.updatedAt.toISOString(),
});
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(skip?: number, take?: number) {
    return (await new UsersRepository(this.prisma).list(skip, take)).map(shape);
  }
  async roles() {
    return (await new UsersRepository(this.prisma).roles()).map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
    }));
  }
  async create(
    input: {
      username: string;
      email?: string;
      password: string;
      displayName: string;
      employeeCode?: string;
      phone?: string;
      department?: string;
      jobTitle?: string;
      role: string;
    },
    actor: Actor,
  ) {
    const repo = new UsersRepository(this.prisma);
    await validateNewPassword(this.prisma, input.password);
    const role = await repo.findRole(input.role);
    if (!role) throw new ServiceError("Role not found.", 400);
    try {
      const user = await repo.create({
        username: input.username,
        email: input.email?.trim().toLowerCase() || undefined,
        passwordHash: await bcrypt.hash(input.password, 12),
        displayName: input.displayName,
        employeeCode: input.employeeCode || undefined,
        phone: input.phone || undefined,
        department: input.department || undefined,
        jobTitle: input.jobTitle || undefined,
        roleId: role.id,
        mustChangePassword: true,
      });
      await new AuditRepository(this.prisma).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "create user",
        entityType: "user",
        entityId: user.id,
      });
      return shape(user);
    } catch (error: any) {
      if (error?.code === "P2002")
        throw new ServiceError(
          "Username, email, or employee code already exists.",
          409,
          "CONFLICT",
        );
      throw error;
    }
  }
  async update(
    id: string,
    input: {
      displayName?: string;
      email?: string | null;
      employeeCode?: string | null;
      phone?: string | null;
      department?: string | null;
      jobTitle?: string | null;
      role?: string;
    },
    actor: Actor,
  ) {
    const repo = new UsersRepository(this.prisma);
    const role = input.role ? await repo.findRole(input.role) : null;
    if (input.role && !role) throw new ServiceError("Role not found.");
    const existing = await repo.findById(id);
    const user = await repo.update(id, {
      displayName: input.displayName,
      email:
        input.email === undefined
          ? undefined
          : input.email?.trim().toLowerCase() || null,
      employeeCode:
        input.employeeCode === undefined
          ? undefined
          : input.employeeCode?.trim() || null,
      phone:
        input.phone === undefined ? undefined : input.phone?.trim() || null,
      department:
        input.department === undefined
          ? undefined
          : input.department?.trim() || null,
      jobTitle:
        input.jobTitle === undefined
          ? undefined
          : input.jobTitle?.trim() || null,
      roleId: role?.id,
    });
    await new AuditRepository(this.prisma).create({
      actorId: actor.id,
      actorRole: actor.role,
      action: "update user",
      entityType: "user",
      entityId: id,
      oldValues: existing ? { displayName: existing.displayName, email: existing.email, role: existing.role.name, active: existing.active } : undefined,
      newValues: { displayName: user.displayName, email: user.email, role: user.role.name, active: user.active },
      changedFields: Object.keys(input),
      riskLevel: input.role ? "HIGH" : "MEDIUM",
    });
    if (input.role && existing?.role.name !== user.role.name) {
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.securitySession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now, revokedById: actor.id, revocationReason: "ROLE_CHANGED" } }),
        this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
      ]);
    }
    return shape(user);
  }
  async password(id: string, password: string, actor: Actor) {
    await validateNewPassword(this.prisma, password, id);
    return this.prisma.$transaction(async (tx) => {
      const previous = await new UsersRepository(tx).findById(id);
      if (!previous) throw new ServiceError("User not found.", 404, "NOT_FOUND");
      await tx.passwordHistory.create({ data: { userId: id, passwordHash: previous.passwordHash } });
      const user = await new UsersRepository(tx).update(id, {
        passwordHash: await bcrypt.hash(password, 12),
        passwordChangedAt: new Date(),
        mustChangePassword: true,
      });
      await new AuthRepository(tx).revokeAllForUser(id, new Date());
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "change user password",
        entityType: "user",
        entityId: id,
        riskLevel: "HIGH",
      });
      return shape(user);
    });
  }
  async status(id: string, active: boolean, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await new UsersRepository(tx).update(id, { active });
      if (!active)
        await new AuthRepository(tx).revokeAllForUser(id, new Date());
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "change user status",
        entityType: "user",
        entityId: id,
      });
      return shape(user);
    });
  }
}

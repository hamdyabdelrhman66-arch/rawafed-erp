import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { AuthRepository } from "../repositories/auth.repository.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { UsersRepository } from "../repositories/users.repository.js";
import type { Actor } from "../dto/core.dto.js";
import { ServiceError } from "./service.error.js";

const shape = (u: any) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
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
  async create(
    input: {
      username: string;
      password: string;
      displayName: string;
      role: string;
    },
    actor: Actor,
  ) {
    const repo = new UsersRepository(this.prisma);
    const role = await repo.findRole(input.role);
    if (!role) throw new ServiceError("Role not found.", 400);
    try {
      const user = await repo.create({
        username: input.username,
        passwordHash: await bcrypt.hash(input.password, 12),
        displayName: input.displayName,
        roleId: role.id,
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
        throw new ServiceError("Username already exists.", 409, "CONFLICT");
      throw error;
    }
  }
  async update(
    id: string,
    input: { displayName?: string; role?: string },
    actor: Actor,
  ) {
    const repo = new UsersRepository(this.prisma);
    const role = input.role ? await repo.findRole(input.role) : null;
    if (input.role && !role) throw new ServiceError("Role not found.");
    const user = await repo.update(id, {
      displayName: input.displayName,
      roleId: role?.id,
    });
    await new AuditRepository(this.prisma).create({
      actorId: actor.id,
      actorRole: actor.role,
      action: "update user",
      entityType: "user",
      entityId: id,
    });
    return shape(user);
  }
  async password(id: string, password: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const user = await new UsersRepository(tx).update(id, {
        passwordHash: await bcrypt.hash(password, 12),
      });
      await new AuthRepository(tx).revokeAllForUser(id, new Date());
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "change user password",
        entityType: "user",
        entityId: id,
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

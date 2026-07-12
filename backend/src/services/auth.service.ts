import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  hashToken,
  signRefreshToken,
  signUser,
  verifyRefreshToken,
} from "../auth.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { UsersRepository } from "../repositories/users.repository.js";
import { ServiceError } from "./service.error.js";

function legacyUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    passwordHash: user.passwordHash,
    displayName: user.displayName,
    role: user.role.name,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}
  async login(username: string, password: string) {
    const user = await new UsersRepository(this.prisma).findActiveByUsername(
      username.trim().toLowerCase(),
    );
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      throw new ServiceError(
        "Invalid username or password.",
        401,
        "SESSION_EXPIRED",
      );
    const shaped = legacyUser(user);
    const id = randomUUID();
    const refreshToken = signRefreshToken(shaped, id);
    await this.prisma.$transaction(async (tx) => {
      await new AuthRepository(tx).createRefreshToken({
        id,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      });
      await new AuditRepository(tx).create({
        actorId: user.id,
        actorRole: user.role.name,
        action: "login",
        entityType: "user",
        entityId: user.id,
      });
    });
    return {
      token: signUser(shaped),
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role.name,
      },
    };
  }
  async refresh(raw: string) {
    let decoded: { sub: string; tokenId: string; type: string };
    try {
      decoded = verifyRefreshToken(raw);
    } catch {
      throw new ServiceError("Invalid refresh token.", 401, "SESSION_EXPIRED");
    }
    if (decoded.type !== "refresh")
      throw new ServiceError("Invalid refresh token.", 401, "SESSION_EXPIRED");
    const [stored, user] = await Promise.all([
      new AuthRepository(this.prisma).findValidRefreshToken(
        decoded.tokenId,
        decoded.sub,
        hashToken(raw),
        new Date(),
      ),
      new UsersRepository(this.prisma).findActiveById(decoded.sub),
    ]);
    if (!stored || !user)
      throw new ServiceError("Invalid refresh token.", 401, "SESSION_EXPIRED");
    const shaped = legacyUser(user);
    return {
      token: signUser(shaped),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role.name,
      },
    };
  }
  async logout(userId: string, role: string | undefined, raw?: string) {
    await this.prisma.$transaction(async (tx) => {
      const auth = new AuthRepository(tx);
      if (raw) await auth.revokeByHash(hashToken(raw), new Date());
      else await auth.revokeAllForUser(userId, new Date());
      await new AuditRepository(tx).create({
        actorId: userId,
        actorRole: role,
        action: "logout",
        entityType: "user",
        entityId: userId,
      });
    });
  }
}

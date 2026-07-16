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
import { maskIdentifier, type RequestSecurityContext } from "../security/security-utils.js";
import { SessionService } from "./session.service.js";

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
  async login(username: string, password: string, context: RequestSecurityContext = {}) {
    const normalized = username.trim().toLowerCase();
    const users = new UsersRepository(this.prisma);
    const user = await users.findByUsername(normalized);
    const now = new Date();
    const settings = await this.prisma.securitySetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
    const validPassword = Boolean(user?.active && await bcrypt.compare(password, user.passwordHash));
    const locked = Boolean(user?.lockedUntil && user.lockedUntil > now);
    if (!user || !validPassword || locked) {
      const count = user ? user.failedLoginCount + 1 : 0;
      const shouldLock = Boolean(user && count >= settings.maxFailedAttempts);
      if (user)
        await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: count, lockedUntil: shouldLock ? new Date(now.getTime() + settings.lockDurationMinutes * 60_000) : user.lockedUntil } });
      const attempt = await this.prisma.loginAttempt.create({ data: { userId: user?.id, usernameMasked: maskIdentifier(normalized), success: false, failureReason: locked ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS", ipAddress: context.ipAddress, userAgent: context.userAgent, browser: context.browser, operatingSystem: context.operatingSystem, deviceType: context.deviceType, requestId: context.requestId, riskScore: shouldLock || locked ? 90 : Math.min(80, count * 15) } });
      await new AuditRepository(this.prisma).create({ actorId: user?.id, actorRole: user?.role.name, action: "login failed", entityType: "user", entityId: user?.id, status: "FAILED", failureReason: locked ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS", riskLevel: shouldLock || locked ? "HIGH" : "MEDIUM", ...context, details: { attemptId: attempt.id, username: maskIdentifier(normalized) } });
      if (shouldLock)
        await this.prisma.securityAlert.create({ data: { severity: "HIGH", alertType: "ACCOUNT_LOCKED", title: "Account locked after failed logins", description: `Repeated failed login attempts for ${maskIdentifier(normalized)}`, userId: user?.id, ipAddress: context.ipAddress, device: context.deviceType } });
      throw new ServiceError("Invalid login credentials", 401, "INVALID_CREDENTIALS");
    }
    const shaped = legacyUser(user);
    const tokenId = randomUUID();
    const sessionId = randomUUID();
    const refreshToken = signRefreshToken(shaped, tokenId);
    const absoluteExpiresAt = new Date(now.getTime() + settings.absoluteTimeoutHours * 3_600_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
      await tx.securitySession.create({ data: { id: sessionId, userId: user.id, idleExpiresAt: new Date(now.getTime() + settings.idleTimeoutMinutes * 60_000), absoluteExpiresAt, ipAddress: context.ipAddress, userAgent: context.userAgent, browser: context.browser, operatingSystem: context.operatingSystem, deviceType: context.deviceType } });
      await new AuthRepository(tx).createRefreshToken({
        id: tokenId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: absoluteExpiresAt,
        sessionId,
      });
      await tx.loginAttempt.create({ data: { userId: user.id, usernameMasked: maskIdentifier(normalized), success: true, sessionId, ipAddress: context.ipAddress, userAgent: context.userAgent, browser: context.browser, operatingSystem: context.operatingSystem, deviceType: context.deviceType, requestId: context.requestId, riskScore: 0 } });
      await new AuditRepository(tx).create({
        actorId: user.id,
        actorRole: user.role.name,
        action: "login succeeded",
        entityType: "user",
        entityId: user.id,
        sessionId,
        riskLevel: "LOW",
        ...context,
      });
    });
    return {
      token: signUser(shaped, sessionId),
      refreshToken,
      sessionId,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role.name,
      },
    };
  }
  async refresh(raw: string, context: RequestSecurityContext = {}) {
    let decoded: { sub: string; tokenId: string; type: string };
    try {
      decoded = verifyRefreshToken(raw);
    } catch {
      throw new ServiceError("Invalid refresh token.", 401, "SESSION_EXPIRED");
    }
    if (decoded.type !== "refresh")
      throw new ServiceError("Invalid refresh token.", 401, "SESSION_EXPIRED");
    const auth = new AuthRepository(this.prisma);
    const decodedRecord = await auth.findRefreshToken(decoded.tokenId);
    if (decodedRecord?.revokedAt) {
      await this.prisma.$transaction(async (tx) => {
        await new AuthRepository(tx).revokeFamily(decodedRecord.familyId, new Date());
        if (decodedRecord.sessionId) await tx.securitySession.updateMany({ where: { id: decodedRecord.sessionId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: "REFRESH_TOKEN_REUSE" } });
        await tx.securityAlert.create({ data: { severity: "CRITICAL", alertType: "REFRESH_TOKEN_REUSE", title: "Refresh token reuse detected", description: "A revoked refresh token was presented again.", userId: decoded.sub, ipAddress: context.ipAddress, device: context.deviceType } });
      });
      throw new ServiceError("Invalid refresh token.", 401, "SESSION_EXPIRED");
    }
    const [stored, user] = await Promise.all([
      auth.findValidRefreshToken(
        decoded.tokenId,
        decoded.sub,
        hashToken(raw),
        new Date(),
      ),
      new UsersRepository(this.prisma).findActiveById(decoded.sub),
    ]);
    if (!stored || !user)
      throw new ServiceError("Invalid refresh token.", 401, "SESSION_EXPIRED");
    if (!stored.sessionId || !(await new SessionService(this.prisma).isActive(user.id, stored.sessionId)))
      throw new ServiceError("Session expired.", 401, "SESSION_EXPIRED");
    const shaped = legacyUser(user);
    const nextId = randomUUID();
    const nextRefresh = signRefreshToken(shaped, nextId);
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), replacedById: nextId } });
      await new AuthRepository(tx).createRefreshToken({ id: nextId, userId: user.id, tokenHash: hashToken(nextRefresh), expiresAt: stored.expiresAt, sessionId: stored.sessionId!, familyId: stored.familyId });
    });
    return {
      token: signUser(shaped, stored.sessionId),
      refreshToken: nextRefresh,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role.name,
      },
    };
  }
  async logout(userId: string, role: string | undefined, raw?: string, sessionId?: string, context: RequestSecurityContext = {}) {
    await this.prisma.$transaction(async (tx) => {
      const auth = new AuthRepository(tx);
      if (raw) await auth.revokeByHash(hashToken(raw), new Date());
      else await auth.revokeAllForUser(userId, new Date());
      if (sessionId) await tx.securitySession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: userId, revocationReason: "USER_LOGOUT" } });
      await new AuditRepository(tx).create({
        actorId: userId,
        actorRole: role,
        action: "logout",
        entityType: "user",
        entityId: userId,
        sessionId,
        ...context,
      });
    });
  }
}

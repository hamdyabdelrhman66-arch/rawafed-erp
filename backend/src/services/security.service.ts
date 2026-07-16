import type { PrismaClient, Prisma } from "@prisma/client";
import { AuditRepository } from "../repositories/audit.repository.js";
import { auditHash, type RequestSecurityContext } from "../security/security-utils.js";
import { ServiceError } from "./service.error.js";

type SecurityActor = { id: string; role?: string; username?: string; displayName?: string; sessionId?: string };

export class SecurityService {
  constructor(private readonly prisma: PrismaClient) {}

  async overview() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const now = new Date();
    const [activeUsers, activeSessions, successfulLogins, failedLogins, lockedAccounts, highRiskActions, openAlerts, permissionChanges, recentExports, mfaUsers, totalUsers, integrity] = await Promise.all([
      this.prisma.user.count({ where: { active: true, deletedAt: null } }),
      this.prisma.securitySession.count({ where: { revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } } }),
      this.prisma.loginAttempt.count({ where: { success: true, createdAt: { gte: start } } }),
      this.prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: start } } }),
      this.prisma.user.count({ where: { lockedUntil: { gt: now } } }),
      this.prisma.auditLog.count({ where: { riskLevel: { in: ["HIGH", "CRITICAL"] }, createdAt: { gte: start } } }),
      this.prisma.securityAlert.count({ where: { status: { in: ["NEW", "INVESTIGATING"] } } }),
      this.prisma.auditLog.count({ where: { action: { contains: "permission", mode: "insensitive" }, createdAt: { gte: start } } }),
      this.prisma.dataExportLog.count({ where: { createdAt: { gte: start } } }),
      this.prisma.user.count({ where: { mfaEnabled: true, active: true } }),
      this.prisma.user.count({ where: { active: true, deletedAt: null } }),
      this.verifyIntegrity(250),
    ]);
    const loginTrend = await this.prisma.loginAttempt.groupBy({ by: ["success"], where: { createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } }, _count: true });
    const moduleActions = await this.prisma.auditLog.groupBy({ by: ["module"], where: { createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } }, _count: true, orderBy: { _count: { module: "desc" } }, take: 8 });
    const alertsBySeverity = await this.prisma.securityAlert.groupBy({ by: ["severity"], where: { status: { not: "RESOLVED" } }, _count: true });
    return { cards: { activeUsers, activeSessions, successfulLogins, failedLogins, lockedAccounts, highRiskActions, openAlerts, permissionChanges, recentExports, mfaAdoption: totalUsers ? Math.round(mfaUsers / totalUsers * 100) : 0, usersWithoutMfa: totalUsers - mfaUsers, auditIntegrity: integrity.valid }, charts: { loginTrend, moduleActions, alertsBySeverity } };
  }

  async audits(query: Record<string, string>) {
    const take = Math.min(200, Math.max(1, Number(query.limit || 50)));
    const skip = Math.max(0, Number(query.offset || 0));
    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined },
      actorId: query.userId || undefined,
      actorRole: query.role || undefined,
      module: query.module || undefined,
      action: query.action ? { contains: query.action, mode: "insensitive" } : undefined,
      entityType: query.entityType || undefined,
      entityId: query.entityId || undefined,
      ipAddress: query.ip || undefined,
      sessionId: query.sessionId || undefined,
      status: query.status || undefined,
      riskLevel: query.riskLevel || undefined,
      requestId: query.requestId || undefined,
      OR: query.search ? [{ action: { contains: query.search, mode: "insensitive" } }, { entityReference: { contains: query.search, mode: "insensitive" } }, { usernameSnapshot: { contains: query.search, mode: "insensitive" } }] : undefined,
    };
    const [rows, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: query.sort === "asc" ? "asc" : "desc" }, skip, take }), this.prisma.auditLog.count({ where })]);
    return { rows, total, limit: take, offset: skip };
  }

  async audit(id: string, actor: SecurityActor, context: RequestSecurityContext) {
    const row = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!row) throw new ServiceError("Audit record not found.", 404, "NOT_FOUND");
    await new AuditRepository(this.prisma).create({ actorId: actor.id, actorRole: actor.role, action: "view audit record", entityType: "audit_log", entityId: id, riskLevel: "MEDIUM", ...context });
    return row;
  }

  sessions(query: Record<string, string>, currentUserId?: string) {
    return this.prisma.securitySession.findMany({ where: { userId: query.mine === "true" ? currentUserId : query.userId || undefined }, include: { user: { select: { username: true, displayName: true, role: { select: { name: true } } } }, revokedBy: { select: { displayName: true } } }, orderBy: { lastActivityAt: "desc" }, take: 200 });
  }

  async revokeSession(id: string, actor: SecurityActor, reason: string, context: RequestSecurityContext) {
    const session = await this.prisma.securitySession.findUnique({ where: { id } });
    if (!session) throw new ServiceError("Session not found.", 404, "NOT_FOUND");
    await this.prisma.$transaction(async (tx) => {
      await tx.securitySession.update({ where: { id }, data: { revokedAt: new Date(), revokedById: actor.id, revocationReason: reason || "ADMIN_REVOKED" } });
      await tx.refreshToken.updateMany({ where: { sessionId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "revoke session", entityType: "security_session", entityId: id, riskLevel: "HIGH", ...context, details: { targetUserId: session.userId, reason } });
    });
    return { revoked: true };
  }

  attempts(query: Record<string, string>) {
    return this.prisma.loginAttempt.findMany({ where: { success: query.success === undefined ? undefined : query.success === "true", userId: query.userId || undefined, ipAddress: query.ip || undefined, createdAt: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } }, include: { user: { select: { username: true, displayName: true } } }, orderBy: { createdAt: "desc" }, take: Math.min(200, Number(query.limit || 100)) });
  }

  alerts() { return this.prisma.securityAlert.findMany({ include: { user: { select: { username: true, displayName: true } }, assignedTo: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 200 }); }
  async updateAlert(id: string, input: { status: string; resolutionNotes?: string; assignedToId?: string }, actor: SecurityActor) {
    return this.prisma.securityAlert.update({ where: { id }, data: { ...input, resolvedAt: input.status === "RESOLVED" ? new Date() : null, assignedToId: input.assignedToId || actor.id } });
  }

  settings() { return this.prisma.securitySetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }); }
  async updateSettings(input: any, actor: SecurityActor, context: RequestSecurityContext) {
    const old = await this.settings();
    const updated = await this.prisma.securitySetting.update({ where: { id: "default" }, data: input });
    await new AuditRepository(this.prisma).create({ actorId: actor.id, actorRole: actor.role, action: "update security settings", entityType: "security_settings", entityId: "default", riskLevel: "HIGH", oldValues: old as any, newValues: updated as any, changedFields: Object.keys(input), ...context });
    return updated;
  }

  async permissions() {
    const [permissions, roles] = await Promise.all([this.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { code: "asc" }] }), this.prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { name: "asc" } })]);
    return { permissions, roles: roles.map((role) => ({ id: role.id, name: role.name, permissions: role.permissions.map((link) => link.permission.code) })) };
  }
  async setRolePermissions(roleId: string, codes: string[], actor: SecurityActor, context: RequestSecurityContext) {
    const old = await this.prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId, permissionId: permission.id })), skipDuplicates: true });
      const users = await tx.user.findMany({ where: { roleId }, select: { id: true } });
      await tx.securitySession.updateMany({ where: { userId: { in: users.map((user) => user.id) }, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: "PERMISSIONS_CHANGED", revokedById: actor.id } });
      await tx.refreshToken.updateMany({ where: { userId: { in: users.map((user) => user.id) }, revokedAt: null }, data: { revokedAt: new Date() } });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "change role permissions", entityType: "role", entityId: roleId, riskLevel: "HIGH", oldValues: old.map((item) => item.permission.code), newValues: codes, changedFields: ["permissions"], ...context });
    });
    return this.permissions();
  }

  exports() { return this.prisma.dataExportLog.findMany({ include: { user: { select: { username: true, displayName: true } } }, orderBy: { createdAt: "desc" }, take: 200 }); }
  trustedDevices() { return this.prisma.trustedDevice.findMany({ include: { user: { select: { username: true, displayName: true } } }, orderBy: { lastUsedAt: "desc" }, take: 200 }); }

  async unlockUser(userId: string, actor: SecurityActor, context: RequestSecurityContext) {
    await this.prisma.user.update({ where: { id: userId }, data: { lockedUntil: null, failedLoginCount: 0 } });
    await new AuditRepository(this.prisma).create({ actorId: actor.id, actorRole: actor.role, action: "unlock account", entityType: "user", entityId: userId, riskLevel: "HIGH", ...context });
    return { unlocked: true };
  }

  async verifyIntegrity(limit = 1000) {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    const invalid: string[] = [];
    for (const row of rows) {
      if (row.recordHash === "legacy-record") continue;
      const { id: _id, createdAt: _createdAt, recordHash, ...payload } = row;
      const clean = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null));
      if (auditHash(clean) !== recordHash) invalid.push(row.id);
    }
    if (invalid.length)
      await this.prisma.securityAlert.create({ data: { severity: "CRITICAL", alertType: "AUDIT_INTEGRITY_FAILURE", title: "Audit integrity verification failed", description: `${invalid.length} audit record hashes did not match.`, relatedAuditIds: invalid } });
    return { valid: invalid.length === 0, checked: rows.length, invalidIds: invalid };
  }
}

export function startSecurityCleanupJob(prisma: PrismaClient) {
  const run = async () => {
    const now = new Date();
    await prisma.$transaction([
      prisma.securitySession.updateMany({ where: { revokedAt: null, OR: [{ idleExpiresAt: { lte: now } }, { absoluteExpiresAt: { lte: now } }] }, data: { revokedAt: now, revocationReason: "EXPIRED" } }),
      prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86400000) } } }),
      prisma.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
    ]);
  };
  void run().catch(() => undefined);
  const timer = setInterval(() => void run().catch(() => undefined), 15 * 60_000);
  timer.unref();
}

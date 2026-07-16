import type { PrismaClient } from "@prisma/client";
import { UsersRepository } from "../repositories/users.repository.js";

export class SessionService {
  constructor(private readonly prisma: PrismaClient) {}
  async isActive(userId: string, sessionId?: string): Promise<boolean> {
    if (!(await new UsersRepository(this.prisma).findActiveById(userId))) return false;
    if (!sessionId) return process.env.ALLOW_LEGACY_ACCESS_TOKENS === "true";
    const now = new Date();
    const session = await this.prisma.securitySession.findFirst({ where: { id: sessionId, userId, revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } } });
    if (!session) return false;
    if (now.getTime() - session.lastActivityAt.getTime() > 60_000) {
      const settings = await this.prisma.securitySetting.findUnique({ where: { id: "default" } });
      await this.prisma.securitySession.update({ where: { id: session.id }, data: { lastActivityAt: now, idleExpiresAt: new Date(now.getTime() + (settings?.idleTimeoutMinutes || 30) * 60_000) } });
    }
    return true;
  }
}

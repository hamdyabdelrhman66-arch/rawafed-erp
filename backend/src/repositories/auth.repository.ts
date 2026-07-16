import type { DatabaseClient } from "./repository.types.js";

export class AuthRepository {
  constructor(private readonly db: DatabaseClient) {}
  createRefreshToken(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    sessionId?: string;
    familyId?: string;
  }) {
    return this.db.refreshToken.create({ data });
  }
  findRefreshToken(id: string) {
    return this.db.refreshToken.findUnique({ where: { id }, include: { session: true } });
  }
  findValidRefreshToken(
    id: string,
    userId: string,
    tokenHash: string,
    now: Date,
  ) {
    return this.db.refreshToken.findFirst({
      where: { id, userId, tokenHash, revokedAt: null, expiresAt: { gt: now } },
    });
  }
  revokeByHash(tokenHash: string, now: Date) {
    return this.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  revokeAllForUser(userId: string, now: Date) {
    return this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  revokeFamily(familyId: string, now: Date) {
    return this.db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
  }
}

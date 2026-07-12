import type { DatabaseClient } from "./repository.types.js";

export class AuthRepository {
  constructor(private readonly db: DatabaseClient) {}
  createRefreshToken(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.db.refreshToken.create({ data });
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
}

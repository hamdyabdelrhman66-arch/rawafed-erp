import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { UserRecord, UserRole } from './types.js';

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'rawafed-dev-secret');
if (!jwtSecret) throw new Error('JWT_SECRET is required in production.');
const refreshSecret = process.env.REFRESH_TOKEN_SECRET || jwtSecret;

export interface AuthRequest extends Request {
  user?: Pick<UserRecord, 'id' | 'username' | 'displayName' | 'role'>;
}

export function signUser(user: UserRecord): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    },
    jwtSecret,
    { expiresIn: '12h' }
  );
}

export function signRefreshToken(user: UserRecord, tokenId: string): string {
  return jwt.sign(
    { sub: user.id, tokenId, type: 'refresh' },
    refreshSecret,
    { expiresIn: '30d' }
  );
}

export function verifyRefreshToken(token: string): { sub: string; tokenId: string; type: string } {
  return jwt.verify(token, refreshSecret) as { sub: string; tokenId: string; type: string };
}

export function createOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthRequest['user'];
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    if (req.user.role === 'Super Admin' || roles.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({ message: 'You do not have access to this resource.' });
  };
}

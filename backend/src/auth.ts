import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { UserRecord, UserRole } from "./types.js";

const jwtSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : "rawafed-dev-secret");
if (!jwtSecret) throw new Error("JWT_SECRET is required in production.");
const refreshSecret =
  process.env.REFRESH_SECRET ||
  process.env.REFRESH_TOKEN_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : jwtSecret);
if (!refreshSecret)
  throw new Error("REFRESH_SECRET is required in production.");
if (process.env.NODE_ENV === "production" && refreshSecret === jwtSecret)
  throw new Error("JWT_SECRET and REFRESH_SECRET must be different.");
const tokenOptions = {
  algorithms: ["HS256"] as jwt.Algorithm[],
  issuer: process.env.JWT_ISSUER || "rawafed-erp",
  audience: process.env.JWT_AUDIENCE || "rawafed-web",
};

export interface AuthRequest extends Request {
  user?: Pick<UserRecord, "id" | "username" | "displayName" | "role"> & { sessionId?: string };
}

export function signUser(user: UserRecord, sessionId?: string): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      sid: sessionId,
    },
    jwtSecret,
    {
      expiresIn: "15m",
      algorithm: "HS256",
      issuer: tokenOptions.issuer,
      audience: tokenOptions.audience,
    },
  );
}

export function signRefreshToken(user: UserRecord, tokenId: string): string {
  return jwt.sign({ sub: user.id, tokenId, type: "refresh" }, refreshSecret, {
    expiresIn: "30d",
    algorithm: "HS256",
    issuer: tokenOptions.issuer,
    audience: tokenOptions.audience,
  });
}

export function verifyRefreshToken(token: string): {
  sub: string;
  tokenId: string;
  type: string;
} {
  return jwt.verify(token, refreshSecret, tokenOptions) as {
    sub: string;
    tokenId: string;
    type: string;
  };
}

export function createOpaqueToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ message: "Authentication required." });
    return;
  }

  try {
    const decoded = jwt.verify(
      token,
      jwtSecret,
      tokenOptions,
    ) as {
      sub: string;
      username: string;
      displayName: string;
      role: UserRole;
      sid?: string;
    };
    req.user = {
      id: decoded.sub,
      username: decoded.username,
      displayName: decoded.displayName,
      role: decoded.role,
      sessionId: decoded.sid,
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    if (req.user.role === "Super Admin" || roles.includes(req.user.role)) {
      next();
      return;
    }

    res
      .status(403)
      .json({ message: "You do not have access to this resource." });
  };
}

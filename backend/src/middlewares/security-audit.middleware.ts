import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { moduleFromPath, requestSecurityContext, riskForAction, sanitizeAuditValue } from "../security/security-utils.js";

const sensitiveViews = /\/api\/(security|users|students\/[^/]+|reports)/;

export function securityAuditMiddleware(prisma: PrismaClient) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on("finish", () => {
      const mutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if ((!mutation && !sensitiveViews.test(req.originalUrl)) || req.originalUrl.startsWith("/api/auth/login") || req.originalUrl.startsWith("/api/auth/refresh")) return;
      const user = (req as AuthRequest).user;
      const action = `${req.method.toLowerCase()} ${req.originalUrl.split("?")[0]}`;
      void new AuditRepository(prisma).create({
        actorId: user?.id,
        actorRole: user?.role,
        action,
        module: moduleFromPath(req.originalUrl),
        entityType: routeEntity(req.originalUrl),
        entityId: String(req.params?.id || "") || undefined,
        status: res.statusCode < 400 ? "SUCCESS" : "FAILED",
        failureReason: res.statusCode < 400 ? undefined : `HTTP_${res.statusCode}`,
        riskLevel: riskForAction(action, res.statusCode < 400 ? "SUCCESS" : "FAILED"),
        newValues: mutation ? sanitizeAuditValue(req.body) as any : undefined,
        details: { query: sanitizeAuditValue(req.query) as any, responseStatus: res.statusCode },
        ...requestSecurityContext(req),
      }).catch(() => undefined);
    });
    next();
  };
}

function routeEntity(path: string): string {
  return path.split("?")[0].split("/").filter(Boolean)[1] || "system";
}

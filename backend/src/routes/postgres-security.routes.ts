import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth } from "../auth.js";
import { SecurityController } from "../controllers/security.controller.js";
import { requireActiveSession } from "../middlewares/active-session.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as validators from "../validators/security.validators.js";

export function postgresSecurityRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const controller = new SecurityController(prisma);
  const secured = [requireAuth, requireActiveSession(prisma)] as const;
  router.get("/api/security/overview", ...secured, requirePermission(prisma, "security.audit.view"), controller.overview);
  router.get("/api/security/audit", ...secured, requirePermission(prisma, "security.audit.view"), controller.audits);
  router.get("/api/security/audit/:id", ...secured, requirePermission(prisma, "security.audit.view"), controller.audit);
  router.get("/api/security/sessions", ...secured, requirePermission(prisma, "security.sessions.view"), controller.sessions);
  router.post("/api/security/sessions/:id/revoke", ...secured, requirePermission(prisma, "security.sessions.revoke"), validate(validators.revokeSession), controller.revokeSession);
  router.get("/api/security/login-attempts", ...secured, requirePermission(prisma, "security.loginAttempts.view"), controller.attempts);
  router.get("/api/security/alerts", ...secured, requirePermission(prisma, "security.audit.view"), controller.alerts);
  router.patch("/api/security/alerts/:id", ...secured, requirePermission(prisma, "security.alerts.manage"), validate(validators.updateAlert), controller.updateAlert);
  router.get("/api/security/settings", ...secured, requirePermission(prisma, "security.audit.view"), controller.settings);
  router.put("/api/security/settings", ...secured, requirePermission(prisma, "security.settings.manage"), validate(validators.settings), controller.updateSettings);
  router.get("/api/security/permissions", ...secured, requirePermission(prisma, "security.audit.view"), controller.permissions);
  router.put("/api/security/roles/:id/permissions", ...secured, requirePermission(prisma, "security.permissions.manage"), validate(validators.permissions), controller.setPermissions);
  router.get("/api/security/exports", ...secured, requirePermission(prisma, "security.audit.view"), controller.exports);
  router.get("/api/security/trusted-devices", ...secured, requirePermission(prisma, "security.audit.view"), controller.devices);
  router.post("/api/security/users/:id/unlock", ...secured, requirePermission(prisma, "security.settings.manage"), validate(validators.userId), controller.unlock);
  router.post("/api/security/integrity/verify", ...secured, requirePermission(prisma, "security.settings.manage"), controller.integrity);
  return router;
}

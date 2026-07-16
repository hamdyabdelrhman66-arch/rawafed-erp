import type { PrismaClient } from "@prisma/client";
import type { Response } from "express";
import type { AuthRequest } from "../auth.js";
import { asyncController } from "./core.controller.js";
import { SecurityService } from "../services/security.service.js";
import { requestSecurityContext } from "../security/security-utils.js";

type SecurityRequest = AuthRequest & { params: Record<string, string>; query: Record<string, string>; body: any };
const actor = (req: SecurityRequest) => ({ id: req.user!.id, role: req.user!.role, username: req.user!.username, displayName: req.user!.displayName, sessionId: req.user!.sessionId });

export class SecurityController {
  private service: SecurityService;
  constructor(prisma: PrismaClient) { this.service = new SecurityService(prisma); }
  overview = asyncController(async (_req, res) => res.json(await this.service.overview()));
  audits = asyncController(async (req, res) => res.json(await this.service.audits(req.query as any)));
  audit = asyncController(async (req, res) => res.json(await this.service.audit(req.params.id, actor(req as SecurityRequest), requestSecurityContext(req))));
  sessions = asyncController(async (req, res) => res.json(await this.service.sessions(req.query as any, req.user!.id)));
  revokeSession = asyncController(async (req, res) => res.json(await this.service.revokeSession(req.params.id, actor(req as SecurityRequest), req.body.reason, requestSecurityContext(req))));
  attempts = asyncController(async (req, res) => res.json(await this.service.attempts(req.query as any)));
  alerts = asyncController(async (_req, res) => res.json(await this.service.alerts()));
  updateAlert = asyncController(async (req, res) => res.json(await this.service.updateAlert(req.params.id, req.body, actor(req as SecurityRequest))));
  settings = asyncController(async (_req, res) => res.json(await this.service.settings()));
  updateSettings = asyncController(async (req, res) => res.json(await this.service.updateSettings(req.body, actor(req as SecurityRequest), requestSecurityContext(req))));
  permissions = asyncController(async (_req, res) => res.json(await this.service.permissions()));
  setPermissions = asyncController(async (req, res) => res.json(await this.service.setRolePermissions(req.params.id, req.body.permissions, actor(req as SecurityRequest), requestSecurityContext(req))));
  exports = asyncController(async (_req, res) => res.json(await this.service.exports()));
  devices = asyncController(async (_req, res) => res.json(await this.service.trustedDevices()));
  unlock = asyncController(async (req, res) => res.json(await this.service.unlockUser(req.params.id, actor(req as SecurityRequest), requestSecurityContext(req))));
  integrity = asyncController(async (_req, res) => res.json(await this.service.verifyIntegrity()));
}

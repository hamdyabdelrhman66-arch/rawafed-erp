import type { NextFunction, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";
import { SessionService } from "../services/session.service.js";

export const requireActiveSession = (prisma: PrismaClient) => {
  const sessions = new SessionService(prisma);
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user || !(await sessions.isActive(req.user.id, req.user.sessionId))) {
      res.status(401).json({ message: "Invalid or expired token." });
      return;
    }
    next();
  };
};

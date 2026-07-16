import type { NextFunction, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";

export function requirePermission(prisma: PrismaClient, permissionCode: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) return void res.status(401).json({ message: "Authentication required." });
    if (req.user.role === "Super Admin") return next();
    const allowed = await prisma.rolePermission.findFirst({ where: { role: { name: req.user.role }, permission: { code: permissionCode } }, select: { roleId: true } });
    if (!allowed) return void res.status(403).json({ message: "Permission denied.", errorCode: "PERMISSION_DENIED" });
    next();
  };
}

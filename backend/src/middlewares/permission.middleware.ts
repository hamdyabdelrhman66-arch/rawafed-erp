import type { NextFunction, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../auth.js";

// These grants belong to the built-in finance roles shipped with Rawafed.  The
// database remains the primary permission source, while this narrow fallback
// prevents an existing deployment with incomplete legacy role_permissions rows
// from locking finance staff out of the core manual-journal workflow.
const builtInJournalGrants: Record<string, ReadonlySet<string>> = {
  "Finance Manager": new Set([
    "journals.create.manual",
    "journals.post",
    "journals.delete.permanent",
    "journals.reverse",
  ]),
  "Chief Accountant": new Set([
    "journals.create.manual",
    "journals.post",
    "journals.delete.permanent",
    "journals.reverse",
  ]),
  Finance: new Set([
    "journals.create.manual",
    "journals.post",
    "journals.delete.permanent",
  ]),
  Accountant: new Set([
    "journals.create.manual",
    "journals.post",
    "journals.delete.permanent",
  ]),
};

export function requirePermission(prisma: PrismaClient, permissionCode: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) return void res.status(401).json({ message: "Authentication required." });
    if (req.user.role === "Super Admin") return next();
    const allowed = await prisma.rolePermission.findFirst({ where: { role: { name: req.user.role }, permission: { code: permissionCode } }, select: { roleId: true } });
    if (!allowed && !builtInJournalGrants[req.user.role]?.has(permissionCode))
      return void res.status(403).json({ message: "Permission denied.", errorCode: "PERMISSION_DENIED" });
    next();
  };
}

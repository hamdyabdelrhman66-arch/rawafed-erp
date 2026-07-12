import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../auth.js";
import { OperationsController } from "../controllers/operations.controller.js";
import { requireActiveSession } from "../middlewares/active-session.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as v from "../validators/operations.validators.js";
export function postgresOperationsRoutes(prisma: PrismaClient) {
  const r = Router(),
    c = new OperationsController(prisma),
    secured = [requireAuth, requireActiveSession(prisma)] as const,
    staffRead = requireRole([
      "Finance",
      "Finance Manager",
      "Chief Accountant",
      "Accountant",
      "Auditor",
    ]),
    payrollWrite = requireRole([
      "Finance",
      "Finance Manager",
      "Chief Accountant",
      "Accountant",
    ]);
  r.get("/api", c.api);
  r.get(
    "/api/admin/export",
    ...secured,
    requireRole(["Super Admin"]),
    c.exportAll,
  );
  r.get(
    "/api/admin/integrity",
    ...secured,
    requireRole(["Super Admin"]),
    c.integrity,
  );
  r.post(
    "/api/admin/announcements",
    ...secured,
    requireRole(["Super Admin"]),
    validate(v.announcement),
    c.announcement,
  );
  r.get("/api/staff", ...secured, staffRead, c.staffList);
  r.post(
    "/api/staff",
    ...secured,
    payrollWrite,
    validate(v.staff),
    c.staffCreate,
  );
  r.patch(
    "/api/staff/:id",
    ...secured,
    payrollWrite,
    validate(v.staff.partial()),
    c.staffUpdate,
  );
  r.delete("/api/staff/:id", ...secured, payrollWrite, c.staffArchive);
  r.get("/api/payroll/runs", ...secured, staffRead, c.payrollList);
  r.post(
    "/api/payroll/runs",
    ...secured,
    payrollWrite,
    validate(v.payroll),
    c.payrollCreate,
  );
  r.get(
    "/api/reports/admissions",
    ...secured,
    requireRole(["Admissions", "Registrar", "Principal"]),
    c.admissions,
  );
  r.get(
    "/api/reports/finance",
    ...secured,
    requireRole(["Finance", "Principal"]),
    c.finance,
  );
  r.get(
    "/api/reports/outstanding",
    ...secured,
    requireRole(["Finance", "Principal"]),
    c.outstanding,
  );
  r.get(
    "/api/reports/daily-payments",
    ...secured,
    requireRole(["Finance", "Principal"]),
    c.daily,
  );
  r.get(
    "/api/reports/monthly-payments",
    ...secured,
    requireRole(["Finance", "Principal"]),
    c.monthly,
  );
  return r;
}

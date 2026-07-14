import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../auth.js";
import { CoreController } from "../controllers/core.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import * as validators from "../validators/core.validators.js";
import { requireActiveSession } from "../middlewares/active-session.middleware.js";

export function postgresCoreRoutes(
  prisma: PrismaClient,
  upload: RequestHandler[],
  loginLimiter: RequestHandler,
): Router {
  const r = Router();
  const c = new CoreController(prisma);
  const secured = [requireAuth, requireActiveSession(prisma)] as const;
  r.post("/api/auth/login", loginLimiter, validate(validators.login), c.login);
  r.get("/api/auth/me", ...secured, c.me);
  r.post("/api/auth/refresh", validate(validators.refresh), c.refresh);
  r.post("/api/auth/logout", ...secured, c.logout);
  r.get("/api/users", ...secured, requireRole(["Super Admin"]), c.listUsers);
  r.get("/api/roles", ...secured, requireRole(["Super Admin"]), c.listRoles);
  r.post(
    "/api/users",
    ...secured,
    requireRole(["Super Admin"]),
    validate(validators.createUser),
    c.createUser,
  );
  r.patch(
    "/api/users/:id",
    ...secured,
    requireRole(["Super Admin"]),
    validate(validators.updateUser),
    c.updateUser,
  );
  r.patch(
    "/api/users/:id/password",
    ...secured,
    requireRole(["Super Admin"]),
    validate(validators.password),
    c.password,
  );
  r.patch(
    "/api/users/:id/status",
    ...secured,
    requireRole(["Super Admin"]),
    validate(validators.activeStatus),
    c.userStatus,
  );
  r.post(
    "/api/public/registrations",
    validate(validators.registration),
    c.publicRegistration,
  );
  r.get(
    "/api/registrations",
    ...secured,
    requireRole(["Admissions", "Registrar", "Principal"]),
    c.registrationsList,
  );
  r.post(
    "/api/registrations",
    ...secured,
    requireRole(["Admissions", "Registrar"]),
    validate(validators.registration),
    c.createRegistration,
  );
  r.patch(
    "/api/registrations/:id/status",
    ...secured,
    requireRole(["Admissions", "Registrar", "Principal"]),
    validate(validators.status),
    c.registrationStatus,
  );
  r.get(
    "/api/students",
    ...secured,
    requireRole(["Admissions", "Registrar", "Principal", "Finance"]),
    c.studentsList,
  );
  r.get(
    "/api/students/:id",
    ...secured,
    requireRole(["Admissions", "Registrar", "Principal", "Finance"]),
    c.student,
  );
  r.post(
    "/api/students/from-registration/:registrationId",
    ...secured,
    requireRole(["Admissions", "Registrar", "Principal"]),
    c.studentFromRegistration,
  );
  r.patch(
    "/api/students/:id",
    ...secured,
    requireRole(["Admissions", "Registrar", "Principal"]),
    validate(validators.studentPatch),
    c.updateStudent,
  );
  r.delete(
    "/api/students/:id",
    ...secured,
    requireRole(["Super Admin"]),
    c.archiveStudent,
  );
  r.get("/api/notifications", ...secured, c.notificationsList);
  r.post("/api/notifications/:id/read", ...secured, c.notificationRead);
  r.post("/api/notifications/read-all", ...secured, c.notificationsReadAll);
  r.get(
    "/api/settings",
    ...secured,
    requireRole(["Admissions", "Registrar", "Principal", "Finance"]),
    c.settingsGet,
  );
  r.put(
    "/api/settings",
    ...secured,
    requireRole(["Super Admin"]),
    validate(validators.settings),
    c.settingsPut,
  );
  r.post("/api/public/uploads", ...upload, c.upload);
  r.post("/api/uploads", ...secured, ...upload, c.upload);
  r.delete(
    "/api/uploads/:id",
    ...secured,
    requireRole(["Super Admin"]),
    c.removeUpload,
  );
  r.get(
    "/api/finance/accounts",
    ...secured,
    requireRole(["Finance"]),
    c.accounts,
  );
  r.get(
    "/api/finance/invoices",
    ...secured,
    requireRole(["Finance"]),
    c.invoices,
  );
  r.get(
    "/api/finance/payments",
    ...secured,
    requireRole(["Finance"]),
    c.payments,
  );
  r.post(
    "/api/finance/invoices",
    ...secured,
    requireRole(["Finance"]),
    validate(validators.invoice),
    c.createInvoice,
  );
  r.post(
    "/api/finance/payments",
    ...secured,
    requireRole(["Finance"]),
    validate(validators.payment),
    c.createPayment,
  );
  r.get("/api/finance/revenue-mappings", ...secured, requireRole(["Finance"]), c.revenueMappings);
  r.put("/api/finance/revenue-mappings/:category", ...secured, requireRole(["Finance Manager"]), c.updateRevenueMapping);
  r.get("/api/finance/direct-costs", ...secured, requireRole(["Finance"]), c.directCosts);
  r.post("/api/finance/direct-costs", ...secured, requireRole(["Finance Manager"]), c.createDirectCost);
  r.post(
    "/api/finance/payments/:id/refund",
    ...secured,
    requireRole(["Finance"]),
    c.refundPayment,
  );
  r.post(
    "/api/finance/payments/:id/cancel",
    ...secured,
    requireRole(["Finance"]),
    c.cancelPayment,
  );
  r.post(
    "/api/finance/invoices/:id/cancel",
    ...secured,
    requireRole(["Finance"]),
    c.cancelInvoice,
  );
  return r;
}

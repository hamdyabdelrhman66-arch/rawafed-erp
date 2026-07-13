import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth.js";
import { FixedAssetsController } from "../controllers/fixed-assets.controller.js";
import { requireActiveSession } from "../middlewares/active-session.middleware.js";

export function postgresFixedAssetsRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const controller = new FixedAssetsController(prisma);
  const secured = [requireAuth, requireActiveSession(prisma)] as const;
  const read = requireRole([
    "Finance",
    "Finance Manager",
    "Chief Accountant",
    "Accountant",
    "Auditor",
  ]);
  const write = requireRole(["Finance", "Finance Manager", "Chief Accountant"]);

  router.get("/api/assets/master-data", ...secured, read, controller.masterData);
  router.get("/api/assets/categories", ...secured, read, controller.categories);
  router.post(
    "/api/assets/categories",
    ...secured,
    write,
    controller.createCategory,
  );
  router.get("/api/assets/reports/:type", ...secured, read, controller.report);
  router.post(
    "/api/assets/depreciation/run",
    ...secured,
    write,
    controller.runDepreciation,
  );
  router.get("/api/assets", ...secured, read, controller.list);
  router.post("/api/assets", ...secured, write, controller.create);
  router.get("/api/assets/:id", ...secured, read, controller.get);
  router.post(
    "/api/assets/:id/depreciation",
    ...secured,
    write,
    controller.depreciate,
  );
  router.post(
    "/api/assets/:id/transfers",
    ...secured,
    write,
    controller.transfer,
  );
  router.post(
    "/api/assets/:id/disposals",
    ...secured,
    write,
    controller.dispose,
  );
  router.post(
    "/api/assets/:id/maintenance",
    ...secured,
    write,
    controller.addMaintenance,
  );
  return router;
}

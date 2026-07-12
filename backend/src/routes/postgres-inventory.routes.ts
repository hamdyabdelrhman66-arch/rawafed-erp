import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../auth.js";
import { InventoryController } from "../controllers/inventory.controller.js";
import { requireActiveSession } from "../middlewares/active-session.middleware.js";
// Prepared only. Do not mount until Phase 3 accounting verification is complete.
export function postgresInventoryRoutes(prisma: PrismaClient): Router {
  const r = Router(),
    c = new InventoryController(prisma),
    secured = [
      requireAuth,
      requireActiveSession(prisma),
      requireRole(["Finance", "Finance Manager"]),
    ] as const;
  r.get("/api/inventory/dashboard", ...secured, c.dashboard);
  r.get("/api/inventory/categories", ...secured, c.categories);
  r.get("/api/inventory/units", ...secured, c.units);
  r.get("/api/inventory/warehouses", ...secured, c.warehouseList);
  r.post("/api/inventory/warehouses", ...secured, c.warehouseCreate);
  r.patch("/api/inventory/warehouses/:id", ...secured, c.warehouseUpdate);
  r.get("/api/inventory/items", ...secured, c.items);
  r.post("/api/inventory/items", ...secured, c.itemCreate);
  r.patch("/api/inventory/items/:id", ...secured, c.itemUpdate);
  r.get("/api/inventory/movements", ...secured, c.movementList);
  r.post("/api/inventory/movements", ...secured, c.movementCreate);
  r.post("/api/inventory/movements/:id/reverse", ...secured, c.movementReverse);
  r.get("/api/inventory/purchase-requests", ...secured, c.requestList);
  r.post("/api/inventory/purchase-requests", ...secured, c.requestCreate);
  r.patch(
    "/api/inventory/purchase-requests/:id/status",
    ...secured,
    c.requestStatus,
  );
  r.get("/api/inventory/purchase-orders", ...secured, c.orderList);
  r.post("/api/inventory/purchase-orders", ...secured, c.orderCreate);
  r.patch(
    "/api/inventory/purchase-orders/:id/status",
    ...secured,
    c.orderStatus,
  );
  r.get("/api/inventory/goods-receipts", ...secured, c.receiptList);
  r.post("/api/inventory/goods-receipts", ...secured, c.receiptCreate);
  r.post("/api/inventory/student-issues", ...secured, c.studentIssue);
  r.get("/api/inventory/transfers", ...secured, c.transferList);
  r.post("/api/inventory/transfers", ...secured, c.transferCreate);
  r.get("/api/inventory/counts", ...secured, c.countList);
  r.post("/api/inventory/counts", ...secured, c.countCreate);
  r.get("/api/inventory/suppliers", ...secured, c.supplierList);
  r.get("/api/inventory/reports", ...secured, c.reportsGet);
  return r;
}

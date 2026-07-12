import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { MonitoringService } from "../services/monitoring.service.js";
export function monitoringRoutes(
  prisma: PrismaClient,
  uploadDir: string,
): Router {
  const r = Router(),
    monitor = new MonitoringService(prisma, uploadDir);
  r.get("/api/live", (_q, s) =>
    s.json({ ok: true, timestamp: new Date().toISOString() }),
  );
  r.get("/api/ready", async (_q, s) => {
    const status = await monitor.snapshot();
    s.status(status.ok ? 200 : 503).json(status);
  });
  r.get("/api/health", async (_q, s) => {
    const status = await monitor.snapshot();
    s.status(status.ok ? 200 : 503).json(status);
  });
  return r;
}

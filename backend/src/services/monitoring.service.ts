import { statfsSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly uploadDir: string,
  ) {}
  async snapshot() {
    const started = performance.now();
    let database = false,
      migrationVersion: string | null = null;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = true;
      const rows = await this.prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1`;
      migrationVersion = rows[0]?.migration_name || null;
    } catch {
      database = false;
    }
    let disk = { ok: false, freeBytes: 0, totalBytes: 0 };
    try {
      const stat = statfsSync(this.uploadDir);
      disk = {
        ok: stat.bavail * stat.bsize > 100 * 1024 * 1024,
        freeBytes: stat.bavail * stat.bsize,
        totalBytes: stat.blocks * stat.bsize,
      };
    } catch {}
    const memory = process.memoryUsage();
    return {
      ok: database && disk.ok,
      database: {
        ok: database,
        driver: "postgres",
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
      },
      disk,
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
      migrationVersion,
      applicationVersion: process.env.npm_package_version || "1.0.0",
      buildVersion: process.env.BUILD_VERSION || "unknown",
      gitCommit: process.env.GIT_COMMIT || "unknown",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

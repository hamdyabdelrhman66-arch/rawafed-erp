import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../auth.js";
import { requestContext } from "../observability/request-context.js";

const write = (level: string, event: Record<string, unknown>) =>
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level, service: "rawafed-backend", ...event })}\n`,
  );
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const started = process.hrtime.bigint(),
    requestId = String(
      (req as any).requestId || res.getHeader("X-Request-Id") || "unknown",
    );
  requestContext.run({ requestId, databaseMs: 0, databaseQueries: 0 }, () => {
    res.on("finish", () => {
      const metrics = requestContext.current();
      write(
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : "info",
        {
          event: "http_request",
          requestId,
          user: (req as AuthRequest).user?.id || null,
          role: (req as AuthRequest).user?.role || null,
          method: req.method,
          endpoint: req.route?.path || req.path,
          status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - started) / 1e6,
          databaseMs: metrics?.databaseMs || 0,
          databaseQueries: metrics?.databaseQueries || 0,
          ip: req.ip,
        },
      );
    });
    next();
  });
}
export function logError(error: unknown, requestId: string): void {
  write("error", {
    event: "application_error",
    requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    message: "Request processing failed",
  });
}

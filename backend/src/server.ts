import "dotenv/config";
import compression from "compression";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuthRequest } from "./auth.js";
import {
  logError,
  requestLogger,
} from "./middlewares/request-logger.middleware.js";
import { validateUploadedFile } from "./middlewares/upload-security.middleware.js";
import { disconnectDatabase, prisma } from "./prisma/client.js";
import { monitoringRoutes } from "./routes/monitoring.routes.js";
import { postgresAccountingRoutes } from "./routes/postgres-accounting.routes.js";
import { postgresCoreRoutes } from "./routes/postgres-core.routes.js";
import { postgresFixedAssetsRoutes } from "./routes/postgres-fixed-assets.routes.js";
import { postgresInventoryRoutes } from "./routes/postgres-inventory.routes.js";
import { postgresOperationsRoutes } from "./routes/postgres-operations.routes.js";
import { ServiceError } from "./services/service.error.js";

const port = Number(process.env.PORT || 4300);
const persistenceDriver = process.env.PERSISTENCE_DRIVER || "postgres";
if (persistenceDriver !== "postgres")
  throw new Error("Only PERSISTENCE_DRIVER=postgres is supported.");
if (
  !process.env.DATABASE_URL ||
  !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)
)
  throw new Error("A valid PostgreSQL DATABASE_URL is required.");

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadDir =
  process.env.RAWAFED_UPLOAD_DIR || join(__dirname, "..", "uploads");
const origins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (
  process.env.NODE_ENV === "production" &&
  (!origins.length || origins.includes("*"))
)
  throw new Error("Explicit CORS_ORIGIN values are required in production.");
mkdirSync(uploadDir, { recursive: true });

const allowedTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, uploadDir),
    filename: (_req, file, done) =>
      done(
        null,
        `${Date.now()}-${randomUUID()}${extname(file.originalname || "")
          .replace(/[^a-z0-9.]/gi, "")
          .slice(0, 12)}`,
      ),
  }),
  fileFilter: (_req, file, done) =>
    allowedTypes.has(file.mimetype)
      ? done(null, true)
      : done(new Error("Unsupported file type.")),
  limits: { fileSize: 20 * 1024 * 1024 },
});
const secureUpload = [upload.single("file"), validateUploadedFile];
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: origins.length ? origins : false, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(
  "/uploads",
  express.static(uploadDir, {
    immutable: true,
    maxAge: "1d",
    dotfiles: "deny",
    index: false,
  }),
);
app.use(standardizeApiResponses);
app.use(requestLogger);
app.use((_req, res, next) => {
  res.setTimeout(30_000, () => {
    if (!res.headersSent)
      res.status(504).json({ message: "Request timed out." });
  });
  next();
});
app.use("/api", apiLimiter);
app.use(monitoringRoutes(prisma, uploadDir));
app.use(postgresCoreRoutes(prisma, secureUpload, loginLimiter));
app.use(postgresAccountingRoutes(prisma));
app.use(postgresFixedAssetsRoutes(prisma));
app.use(postgresInventoryRoutes(prisma));
app.use(postgresOperationsRoutes(prisma));
app.get("/", (_req, res) =>
  res.json({
    ok: true,
    service: "rawafed-backend",
    message: "Backend API is running.",
    api: "/api",
    health: "/api/health",
  }),
);
app.use("/api", (req, res) =>
  res
    .status(404)
    .json({ message: `Endpoint ${req.method} ${req.path} was not found.` }),
);
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = safeErrorMessage(error),
    status =
      error instanceof ServiceError
        ? error.status
        : message === "Unsupported file type."
          ? 400
          : 500,
    requestId = String((req as any).requestId || "unknown");
  logError(error, requestId);
  res
    .status(status)
    .json({
      success: false,
      errorCode:
        error instanceof ServiceError
          ? error.code
          : status === 400
            ? "VALIDATION_ERROR"
            : "SERVER_ERROR",
      safeMessage: message,
      requestId,
    });
});

const server = app.listen(port, () => {
  process.stdout.write(
    `Persistence driver: postgres\nRawafed backend listening on http://127.0.0.1:${port}\n`,
  );
});
server.requestTimeout = 35_000;
server.headersTimeout = 40_000;
server.keepAliveTimeout = 5_000;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 30_000).unref();
  });

function standardizeApiResponses(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = `REQ-${randomUUID()}`;
  (req as any).requestId = id;
  res.setHeader("X-Request-Id", id);
  const json = res.json.bind(res);
  res.json = (body?: any) =>
    res.statusCode >= 400 && !body?.success
      ? json({
          success: false,
          errorCode: body?.errorCode || statusCode(res.statusCode),
          safeMessage: safeErrorMessage(
            body?.safeMessage || body?.message || body,
          ),
          fieldErrors: body?.fieldErrors || body?.errors?.fieldErrors,
          requestId: id,
          details: body?.details,
        })
      : json(body);
  next();
}
function statusCode(status: number): string {
  return (
    (
      {
        400: "VALIDATION_ERROR",
        401: "SESSION_EXPIRED",
        403: "PERMISSION_DENIED",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "BUSINESS_RULE_FAILED",
        429: "RATE_LIMITED",
        500: "SERVER_ERROR",
        503: "SERVICE_UNAVAILABLE",
        504: "TIMEOUT",
      } as Record<number, string>
    )[status] || "REQUEST_FAILED"
  );
}
function safeErrorMessage(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as any).message || "")
          : "";
  if (!raw.trim())
    return "The server could not complete the request. Please try again.";
  return /sql|sqlite|stack|\/opt\/|\/users\/|token|secret|password hash|postgres/i.test(
    raw,
  )
    ? "The server could not complete the request. Please try again."
    : raw.trim();
}

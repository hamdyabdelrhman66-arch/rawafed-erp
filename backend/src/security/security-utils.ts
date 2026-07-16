import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import type { AuthRequest } from "../auth.js";

const sensitive = /password|secret|token|cookie|authorization|otp|recovery|card|cvv|mfa/i;
const maskable = /national.?id|iqama|phone|email|iban|bank.?account|salary/i;

export type RequestSecurityContext = {
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  browser?: string;
  operatingSystem?: string;
  deviceType?: string;
  requestId?: string;
  httpMethod?: string;
  apiEndpoint?: string;
  frontendRoute?: string;
  source?: string;
};

export function requestSecurityContext(req: Request): RequestSecurityContext {
  const ua = String(req.get("user-agent") || "").slice(0, 600);
  const device = parseUserAgent(ua);
  return {
    sessionId: (req as AuthRequest).user?.sessionId,
    ipAddress: String(req.ip || req.socket.remoteAddress || "").slice(0, 80),
    userAgent: ua,
    ...device,
    requestId: String((req as any).requestId || req.get("x-request-id") || "").slice(0, 100),
    httpMethod: req.method,
    apiEndpoint: String(req.originalUrl || req.path).split("?")[0].slice(0, 500),
    frontendRoute: String(req.get("x-rawafed-route") || "").slice(0, 500) || undefined,
    source: "WEB",
  };
}

export function parseUserAgent(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";
  const operatingSystem = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  const deviceType = /Mobile|Android|iPhone/.test(ua) ? "Mobile" : /iPad|Tablet/.test(ua) ? "Tablet" : "Desktop";
  return { browser, operatingSystem, deviceType };
}

export function maskIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 2) return "**";
  return `${trimmed.slice(0, 1)}${"*".repeat(Math.min(8, trimmed.length - 2))}${trimmed.slice(-1)}`;
}

export function sanitizeAuditValue(value: unknown, key = "root"): unknown {
  if (sensitive.test(key)) return "[REDACTED]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeAuditValue(item, key));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value === "object" && typeof (value as { toJSON?: unknown }).toJSON === "function")
    return sanitizeAuditValue((value as { toJSON(): unknown }).toJSON(), key);
  if (typeof value === "object")
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 300).map(([childKey, child]) => [childKey, sanitizeAuditValue(child, childKey)]));
  if (maskable.test(key) && typeof value === "string") return maskIdentifier(value);
  if (typeof value === "string") return value.slice(0, 4000);
  return value;
}

export function auditHash(value: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function encryptSecret(plain: string): string {
  const key = secretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [iv, tag, encrypted] = payload.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function secretKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
  if (process.env.NODE_ENV === "production" && configured.length < 32)
    throw new Error("MFA_ENCRYPTION_KEY must contain at least 32 characters in production.");
  return createHash("sha256").update(configured || "rawafed-development-mfa-key").digest();
}

export function moduleFromPath(path: string): string {
  if (/security|auth|users|roles/.test(path)) return "security";
  if (/payroll|staff/.test(path)) return "payroll";
  if (/inventory|purchase/.test(path)) return "inventory";
  if (/fixed-assets/.test(path)) return "fixed-assets";
  if (/students|registrations/.test(path)) return "students";
  if (/reports/.test(path)) return "reports";
  if (/finance|accounting/.test(path)) return "finance";
  return "system";
}

export function riskForAction(action: string, status = "SUCCESS"): string {
  if (status !== "SUCCESS" || /permission|role|password|mfa|revoke|refund|reverse|delete|restore|export/i.test(action)) return "HIGH";
  if (/create|update|edit|post|pay|archive|download|print/i.test(action)) return "MEDIUM";
  return "LOW";
}

import { z } from "zod";

export const revokeSession = z.object({ reason: z.string().trim().max(300).default("ADMIN_REVOKED") });
export const updateAlert = z.object({ status: z.enum(["NEW", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"]), resolutionNotes: z.string().max(2000).optional(), assignedToId: z.string().uuid().optional() });
export const settings = z.object({ maxFailedAttempts: z.number().int().min(3).max(20).optional(), failureWindowMinutes: z.number().int().min(1).max(1440).optional(), lockDurationMinutes: z.number().int().min(1).max(10080).optional(), idleTimeoutMinutes: z.number().int().min(5).max(1440).optional(), absoluteTimeoutHours: z.number().int().min(1).max(168).optional(), maxConcurrentSessions: z.number().int().min(1).max(50).optional(), minimumPasswordLength: z.number().int().min(10).max(128).optional(), passwordHistoryCount: z.number().int().min(0).max(24).optional(), requireMfaPrivileged: z.boolean().optional(), segregationOfDuties: z.boolean().optional(), auditRetentionDays: z.number().int().min(365).max(36500).optional() }).strict();
export const permissions = z.object({ permissions: z.array(z.string().min(3).max(120)).max(300) });
export const userId = z.object({}).strict();

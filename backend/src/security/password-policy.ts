import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { ServiceError } from "../services/service.error.js";

const common = new Set(["password", "password123", "123456789012", "qwerty123456", "admin123456", "rawafed1234"]);

export async function validateNewPassword(prisma: PrismaClient, password: string, userId?: string): Promise<void> {
  const settings = await prisma.securitySetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  if (password.length < settings.minimumPasswordLength)
    throw new ServiceError(`Password must contain at least ${settings.minimumPasswordLength} characters.`, 400, "WEAK_PASSWORD");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password))
    throw new ServiceError("Password must include upper-case, lower-case, number, and symbol.", 400, "WEAK_PASSWORD");
  if (common.has(password.toLowerCase())) throw new ServiceError("This password is too common.", 400, "WEAK_PASSWORD");
  if (userId && settings.passwordHistoryCount > 0) {
    const history = await prisma.passwordHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: settings.passwordHistoryCount });
    for (const previous of history)
      if (await bcrypt.compare(password, previous.passwordHash)) throw new ServiceError("A recently used password cannot be reused.", 409, "PASSWORD_REUSED");
  }
}

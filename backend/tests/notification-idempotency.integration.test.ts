import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { NotificationsRepository } from "../src/repositories/notifications.repository.js";
import { NotificationsService } from "../src/services/notifications.service.js";

class RollbackNotificationFixture extends Error {}

describe("canonical notifications", () => {
  it("stores one record per event and updates read state in the same source", async () => {
    const result = { count: 0, read: false };
    await expect(
      prisma.$transaction(async (tx) => {
        const sourceId = randomUUID();
        const repository = new NotificationsRepository(tx);
        const payload = {
          message: "New application waiting approval",
          targetRoles: ["Admissions"],
          category: "registration",
          readBy: [],
          sourceType: "registration",
          sourceId,
          eventType: "SUBMITTED",
          targetRole: "admissions",
        };
        const first = await repository.createCanonical(payload);
        await repository.createCanonical(payload);
        result.count = await tx.notification.count({
          where: {
            sourceType: "registration",
            sourceId,
            eventType: "SUBMITTED",
            targetRole: "admissions",
          },
        });
        const service = new NotificationsService(tx as unknown as PrismaClient);
        await service.markRead(first.id, "Admissions");
        const updated = await tx.notification.findUnique({
          where: { id: first.id },
        });
        result.read =
          Array.isArray(updated?.readBy) &&
          updated.readBy.includes("Admissions");
        throw new RollbackNotificationFixture();
      }),
    ).rejects.toBeInstanceOf(RollbackNotificationFixture);
    expect(result).toEqual({ count: 1, read: true });
  }, 20_000);
});

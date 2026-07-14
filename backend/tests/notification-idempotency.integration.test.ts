import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { NotificationsRepository } from "../src/repositories/notifications.repository.js";
import { NotificationsService } from "../src/services/notifications.service.js";

class RollbackNotificationFixture extends Error {}

describe("canonical notifications", () => {
  it("stores one record per event and updates read state in the same source", async () => {
    const result = { count: 0, firstUserRead: false, secondUserRead: false };
    await expect(
      prisma.$transaction(
        async (tx) => {
          const admissionsRole = await tx.role.findUniqueOrThrow({ where: { name: "Admissions" } });
          const firstUser = await tx.user.create({
            data: {
              username: `notification-first-${randomUUID()}`,
              passwordHash: "test-only",
              displayName: "Notification First User",
              roleId: admissionsRole.id,
            },
          });
          const secondUser = await tx.user.create({
            data: {
              username: `notification-second-${randomUUID()}`,
              passwordHash: "test-only",
              displayName: "Notification Second User",
              roleId: admissionsRole.id,
            },
          });
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
          const service = new NotificationsService(
            tx as unknown as PrismaClient,
          );
          await service.markRead(first.id, "Admissions", firstUser.id);
          const firstView = await service.list("Admissions", firstUser.id);
          const secondView = await service.list("Admissions", secondUser.id);
          result.firstUserRead = Boolean(firstView.find((note) => note.id === first.id)?.read);
          result.secondUserRead = Boolean(secondView.find((note) => note.id === first.id)?.read);
          throw new RollbackNotificationFixture();
        },
        { timeout: 20_000 },
      ),
    ).rejects.toBeInstanceOf(RollbackNotificationFixture);
    expect(result).toEqual({ count: 1, firstUserRead: true, secondUserRead: false });
  }, 20_000);
});

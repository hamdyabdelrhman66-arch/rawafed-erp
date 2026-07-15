import type { PrismaClient } from "@prisma/client";
import { NotificationsRepository } from "../repositories/notifications.repository.js";

export class NotificationsService {
  private static lastInstallmentSyncAt = 0;
  constructor(private readonly prisma: PrismaClient) {}
  async list(role: string, userId: string, skip?: number, take?: number) {
    await this.syncInstallmentReminders();
    return (await new NotificationsRepository(this.prisma).list(skip, take, userId))
      .filter(
        (n) =>
          n.targetRoles === "all" ||
          (Array.isArray(n.targetRoles) && n.targetRoles.includes(role)),
      )
      .map((n) => ({
        ...n,
        read: Boolean((n as any).reads?.length) || (Array.isArray(n.readBy) && n.readBy.map(String).includes(userId)),
        reads: undefined,
        createdAt: n.createdAt.toISOString(),
        updatedAt: undefined,
        deletedAt: undefined,
      }));
  }
  private async syncInstallmentReminders() {
    const syncAt = Date.now();
    if (syncAt - NotificationsService.lastInstallmentSyncAt < 300_000) return;
    NotificationsService.lastInstallmentSyncAt = syncAt;
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const rows = await this.prisma.installment.findMany({
      where: { status: { not: "paid" }, plan: { active: true, deletedAt: null } },
      include: {
        plan: true,
        customer: { include: { student: true, registration: true } },
      },
    });
    const repo = new NotificationsRepository(this.prisma);
    for (const installment of rows) {
      if (Number(installment.paidAmount) >= Number(installment.amount)) continue;
      const due = Date.UTC(installment.dueDate.getUTCFullYear(), installment.dueDate.getUTCMonth(), installment.dueDate.getUTCDate());
      const days = Math.round((due - today) / 86_400_000);
      const configured = Array.isArray(installment.plan.reminderDays)
        ? installment.plan.reminderDays.map(Number)
        : [7, 3, 1, 0];
      const stage = days === 0 ? "DUE_TODAY" : days < 0 ? "OVERDUE" : configured.includes(days) ? `UPCOMING_${days}` : "";
      if (!stage || (days < 0 && configured.some((value) => value < 0) && !configured.includes(days))) continue;
      const registrationData = installment.customer.registration?.data as any;
      const guardian = registrationData?.guardian?.name || registrationData?.parent?.name || "-";
      const studentName = installment.customer.student?.englishName || installment.customer.nameEn;
      const remaining = Math.round((Number(installment.amount) - Number(installment.paidAmount)) * 100) / 100;
      await repo.createCanonical({
        message: `${stage === "OVERDUE" ? "Overdue" : stage === "DUE_TODAY" ? "Due today" : "Upcoming"} installment: ${studentName} · Guardian ${guardian} · SAR ${remaining.toFixed(2)} · ${installment.dueDate.toISOString().slice(0, 10)}`,
        targetRoles: ["Finance", "Finance Manager", "Chief Accountant", "Accountant", "Super Admin"],
        category: "finance",
        readBy: [],
        link: `/finance/customers/${installment.customerId}`,
        sourceType: "installment",
        sourceId: installment.id,
        eventType: stage,
        targetRole: "finance",
        messageKey: `installment.${stage.toLowerCase()}`,
        parameters: { studentName, guardian, amount: remaining, dueDate: installment.dueDate.toISOString().slice(0, 10), remainingBalance: remaining },
      });
    }
  }
  async markRead(id: string, role: string, userId: string) {
    const repo = new NotificationsRepository(this.prisma);
    const rows = await repo.list(0, 1000, userId);
    const note = rows.find((n) => n.id === id);
    if (!note) return;
    const visible =
      note.targetRoles === "all" ||
      (Array.isArray(note.targetRoles) && note.targetRoles.includes(role));
    if (!visible) return;
    await repo.markRead(id, userId);
  }
  async markAllRead(role: string, userId: string) {
    const rows = await new NotificationsRepository(this.prisma).list(0, 1000, userId);
    const visible = rows.filter((note) =>
      note.targetRoles === "all" ||
      (Array.isArray(note.targetRoles) && note.targetRoles.includes(role)),
    );
    await new NotificationsRepository(this.prisma).markAllRead(visible.map((note) => note.id), userId);
    return { updated: visible.length };
  }
}

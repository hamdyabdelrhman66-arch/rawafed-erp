import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor, RegistrationInput } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { FinanceAccountsRepository } from "../repositories/finance-accounts.repository.js";
import { NotificationsRepository } from "../repositories/notifications.repository.js";
import { RegistrationsRepository } from "../repositories/registrations.repository.js";
import { StudentsRepository } from "../repositories/students.repository.js";
import { ServiceError } from "./service.error.js";
import { money, vatForSubtotal } from "./student-vat.js";

const json = (value: unknown) => value as Prisma.InputJsonValue;
const unpack = (row: any) => ({
  ...(row.data as object),
  id: row.id,
  registrationNumber: row.registrationNumber,
  status: row.status,
  submittedAt: row.submittedAt?.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const baseFees = (r: RegistrationInput) =>
  [
    ["Registration Fee", "registrationFee"],
    ["Tuition", "tuition"],
    ["Books", "books"],
    ["Uniform", "uniform"],
    ["Activities", "activities"],
    ["Transportation", "transportationFee"],
  ]
    .map(([name, key]) => ({ name, amount: Number(r.financial?.[key] || 0) }))
    .filter((item) => item.amount > 0);
const subtotal = (r: RegistrationInput) =>
  money(baseFees(r).reduce((sum, item) => sum + item.amount, 0));
const vat = (r: RegistrationInput) =>
  vatForSubtotal(subtotal(r), r.student?.nationalId);
const total = (r: RegistrationInput) => money(subtotal(r) + vat(r));
const fees = (r: RegistrationInput) => [
  ...baseFees(r),
  ...(vat(r) ? [{ name: "VAT", amount: vat(r) }] : []),
];

export class RegistrationsService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(skip?: number, take?: number) {
    return (
      await new RegistrationsRepository(this.prisma).list(skip, take)
    ).map(unpack);
  }
  async create(input: RegistrationInput, actor?: Actor) {
    const vatAmount = vat(input);
    input.financial = {
      ...(input.financial || {}),
      vat: vatAmount,
      grandTotal: money(subtotal(input) + vatAmount),
    };
    return this.prisma.$transaction(
      async (tx) => {
        const repo = new RegistrationsRepository(tx);
        if (input.id) {
          const existing = await repo.findById(input.id);
          if (existing) return unpack(existing);
        }
        const branch = await tx.branch.findFirst({
          where: { active: true, deletedAt: null },
        });
        if (!branch)
          throw new ServiceError("Active branch is not configured.", 422);
        const now = new Date();
        const prefix = `RAW-${now.getFullYear()}-`;
        const latest = await repo.latestNumber(prefix);
        const next =
          Number(latest?.registrationNumber.slice(prefix.length) || 124) + 1;
        const registrationNumber =
          input.registrationNumber ||
          `${prefix}${String(next).padStart(6, "0")}`;
        const row = await repo.create({
          id: input.id || randomUUID(),
          registrationNumber,
          branchId: branch.id,
          status: input.status || "pending",
          studentName: input.student?.englishName || input.student?.arabicName,
          grade: input.student?.applyingGrade,
          submittedAt: new Date(input.submittedAt || now),
          data: json(input),
          createdAt: new Date(input.createdAt || now),
        });
        await new NotificationsRepository(tx).createCanonical({
          message: `New application waiting approval: ${input.student?.englishName || registrationNumber}`,
          targetRoles: ["Admissions", "Registrar", "Principal", "Super Admin"],
          category: "registration",
          readBy: [],
          link: "/applications",
          sourceType: "registration",
          sourceId: row.id,
          eventType: "SUBMITTED",
          targetRole: "admissions",
          messageKey: "notifications.registration_submitted",
          parameters: json({
            studentName: input.student?.englishName || registrationNumber,
          }),
        });
        await new AuditRepository(tx).create({
          actorId: actor?.id,
          actorRole: actor?.role,
          action: actor ? "create registration" : "public create registration",
          entityType: "registration",
          entityId: row.id,
          details: { registrationNumber },
        });
        return unpack(row);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async setStatus(id: string, status: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const registrations = new RegistrationsRepository(tx);
      const current = await registrations.findById(id);
      if (!current)
        throw new ServiceError("Registration not found.", 404, "NOT_FOUND");
      const updated = await registrations.updateStatus(id, status);
      if (status === "approved") {
        const data = current.data as RegistrationInput;
        const parent = data.father?.fullName
          ? data.father
          : data.mother || data.father || {};
        const student = await new StudentsRepository(tx).upsertForRegistration(
          id,
          {
            branchId: current.branchId,
            registrationNumber: current.registrationNumber,
            englishName:
              data.student?.englishName ||
              data.student?.arabicName ||
              "Student",
            arabicName: data.student?.arabicName,
            grade: data.student?.applyingGrade || "",
            nationalId: data.student?.nationalId || null,
            passportNumber: data.student?.passportNumber || null,
            parentName: parent.fullName,
            parentPhone: parent.phone,
            parentEmail: parent.email,
            status: "active",
            profile: json(data),
          },
        );
        await new FinanceAccountsRepository(tx).upsert(
          id,
          student.id,
          total(data),
          fees(data),
        );
        let customer = await tx.accountingCustomer.findUnique({
          where: { studentId: student.id },
        });
        if (!customer) {
          const parent = await tx.chartOfAccount.findUnique({
            where: { systemKey: "accounts-receivable" },
          });
          if (!parent)
            throw new ServiceError(
              "Accounts receivable control account is not configured.",
              422,
            );
          const receivable = await tx.chartOfAccount.create({
            data: {
              code: `${parent.code}-${student.id.slice(0, 8)}`,
              name: `AR - ${student.englishName}`,
              nameAr: student.arabicName
                ? `ذمم - ${student.arabicName}`
                : undefined,
              type: "ASSET",
              parentId: parent.id,
              isReceivableAccount: true,
            },
          });
          customer = await tx.accountingCustomer.create({
            data: {
              customerCode: `CUS-${student.id.slice(0, 8).toUpperCase()}`,
              studentId: student.id,
              registrationId: id,
              registrationNumber: current.registrationNumber,
              nameEn: student.englishName,
              nameAr: student.arabicName,
              phone: student.parentPhone,
              email: student.parentEmail,
              nationalId: student.nationalId,
              receivableAccountId: receivable.id,
            },
          });
        }
        const notices = new NotificationsRepository(tx);
        await notices.createCanonical({
          message: `Student created from approved application: ${student.englishName}`,
          targetRoles: ["Admissions", "Registrar", "Principal", "Super Admin"],
          category: "registration",
          readBy: [],
          link: "/students",
          sourceType: "registration",
          sourceId: id,
          eventType: "APPROVED",
          targetRole: "admissions",
          messageKey: "notifications.registration_approved",
          parameters: json({ studentName: student.englishName }),
        });
        await notices.createCanonical({
          message: `Student finance account created: ${student.englishName}`,
          targetRoles: ["Finance", "Super Admin"],
          category: "finance",
          readBy: [],
          link: "/finance/patient-packages",
          sourceType: "finance_account",
          sourceId: id,
          eventType: "CREATED",
          targetRole: "finance",
          messageKey: "notifications.finance_account_created",
          parameters: json({ studentName: student.englishName }),
        });
        const audit = new AuditRepository(tx);
        if (!(await audit.findByIdempotencyKey(`approve-registration:${id}`)))
          await audit.create({
            actorId: actor.id,
            actorRole: actor.role,
            action: "approve application",
            entityType: "registration",
            entityId: id,
            idempotencyKey: `approve-registration:${id}`,
          });
      }
      return unpack(updated);
    });
  }
}

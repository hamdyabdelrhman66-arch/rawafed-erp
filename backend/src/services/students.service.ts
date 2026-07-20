import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { FinanceAccountsRepository } from "../repositories/finance-accounts.repository.js";
import { RegistrationsRepository } from "../repositories/registrations.repository.js";
import { StudentsRepository } from "../repositories/students.repository.js";
import { RegistrationsService } from "./registrations.service.js";
import { ServiceError } from "./service.error.js";
import { recalculateStudentVatUsing } from "./student-vat.js";

const shape = (s: any) => ({
  ...s,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
  deletedAt: undefined,
});
export class StudentsService {
  constructor(private readonly prisma: PrismaClient) {}
  async list(skip?: number, take?: number) {
    return (await new StudentsRepository(this.prisma).list(skip, take)).map(
      shape,
    );
  }
  async get(id: string) {
    const row = await new StudentsRepository(this.prisma).findById(id);
    if (!row) throw new ServiceError("Student not found.", 404, "NOT_FOUND");
    return shape(row);
  }
  async fromRegistration(id: string, actor: Actor) {
    await new RegistrationsService(this.prisma).setStatus(
      id,
      "approved",
      actor,
    );
    const student = await new StudentsRepository(
      this.prisma,
    ).findByRegistrationId(id);
    if (!student)
      throw new ServiceError("Registration not found.", 404, "NOT_FOUND");
    return shape(student);
  }
  async update(id: string, data: Record<string, unknown>, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const current = await new StudentsRepository(tx).findById(id);
      if (!current) throw new ServiceError("Student not found.", 404, "NOT_FOUND");
      const currentProfile = (current.profile || {}) as Record<string, any>;
      const currentStudentProfile = currentProfile.student || currentProfile;
      const identityChanged = ["nationalId", "nationality", "identityType"].some((key) => Object.prototype.hasOwnProperty.call(data, key));
      const nextIdentity = {
        identityType: data.identityType ?? currentStudentProfile.identityType,
        identityNumber: data.nationalId ?? current.nationalId ?? currentStudentProfile.nationalId,
        nationality: data.nationality ?? currentStudentProfile.nationality,
      };
      if (identityChanged) await recalculateStudentVatUsing(tx, id, nextIdentity);
      const { nationality, identityType, ...studentData } = data;
      if (identityChanged) {
        studentData.profile = {
          ...currentProfile,
          student: {
            ...currentStudentProfile,
            nationality: nextIdentity.nationality,
            identityType: nextIdentity.identityType,
            nationalId: nextIdentity.identityNumber,
          },
        };
      }
      const row = await new StudentsRepository(tx).update(
        id,
        studentData as Prisma.StudentUpdateInput,
      );
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: identityChanged ? "update student identity and recalculate VAT" : "update student",
        entityType: "student",
        entityId: id,
      });
      return shape(row);
    });
  }
  async archive(id: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new StudentsRepository(tx);
      if (await repo.financeReferences(id))
        throw new ServiceError(
          "Student has finance records and cannot be deleted. Archive remains restricted until retention policy is configured.",
          422,
        );
      await repo.archive(id);
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "archive student",
        entityType: "student",
        entityId: id,
      });
    });
  }
}

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
  async list(skip?: number, take?: number, includeArchived = false) {
    return (await new StudentsRepository(this.prisma).list(skip, take, includeArchived)).map(
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
      const identityFields = ["nationalId", "nationality", "identityType"];
      const financeFields = ["grade", "academicYear", "paymentPlan"];
      const identityChanged = identityFields.some((key) => Object.prototype.hasOwnProperty.call(data, key));
      const financeChanged = financeFields.some((key) => Object.prototype.hasOwnProperty.call(data, key));
      if ((identityChanged || financeChanged) && !String(data.reason || "").trim())
        throw new ServiceError("A reason is required for sensitive student changes.", 422, "SENSITIVE_CHANGE_REASON_REQUIRED");
      if (identityChanged) await this.assertPermission(tx, actor, "students.edit.identity");
      if (financeChanged) await this.assertPermission(tx, actor, "students.edit.financeData");
      if (data.paymentPlan) {
        const payments = await tx.financePayment.count({ where: { account: { studentId: id }, deletedAt: null } });
        if (payments) throw new ServiceError("Payment plan cannot be replaced after a payment. Create a controlled revised schedule instead.", 422, "PAYMENT_PLAN_HAS_POSTED_PAYMENTS");
      }
      const nextIdentity = {
        identityType: data.identityType ?? currentStudentProfile.identityType,
        identityNumber: data.nationalId ?? current.nationalId ?? currentStudentProfile.nationalId,
        nationality: data.nationality ?? currentStudentProfile.nationality,
      };
      if (identityChanged) await recalculateStudentVatUsing(tx, id, nextIdentity);
      const profileFields = ["gender", "dateOfBirth", "nationality", "identityType", "academicYear", "className", "address", "guardian", "emergencyContact", "medical", "documents", "transportationRequest", "paymentPlan", "notes"];
      const nextProfileStudent = { ...currentStudentProfile };
      for (const key of profileFields) if (Object.prototype.hasOwnProperty.call(data, key)) nextProfileStudent[key] = data[key];
      if (identityChanged) {
        nextProfileStudent.nationality = nextIdentity.nationality;
        nextProfileStudent.identityType = nextIdentity.identityType;
        nextProfileStudent.nationalId = nextIdentity.identityNumber;
      }
      const studentData: Record<string, unknown> = {};
      for (const key of ["englishName", "arabicName", "grade", "nationalId", "passportNumber", "parentName", "parentPhone", "parentEmail", "status"])
        if (Object.prototype.hasOwnProperty.call(data, key)) studentData[key] = data[key];
      studentData.profile = { ...currentProfile, student: nextProfileStudent };
      const row = await new StudentsRepository(tx).update(
        id,
        studentData as Prisma.StudentUpdateInput,
      );
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: identityChanged ? "STUDENT_SENSITIVE_IDENTITY_EDITED" : financeChanged ? "STUDENT_FINANCE_PROFILE_EDITED" : "STUDENT_EDITED",
        entityType: "student",
        entityId: id,
        oldValues: current as any,
        newValues: row as any,
        changedFields: Object.keys(data).filter((key) => key !== "reason"),
        details: { reason: String(data.reason || ""), postedFinancialRecordsChanged: false },
        riskLevel: identityChanged || financeChanged ? "HIGH" : "MEDIUM",
      });
      return {
        ...shape(row),
        warnings: financeChanged ? ["Posted invoices, payments, receipts, and journals were not changed.", "Finance review may be required for future fees or VAT treatment."] : [],
      };
    });
  }
  async archive(id: string, actor: Actor, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new StudentsRepository(tx);
      const current = await repo.findById(id);
      if (!current) throw new ServiceError("Student not found.", 404, "NOT_FOUND");
      const row = await repo.archive(id);
      await new AuditRepository(tx).create({
        actorId: actor.id,
        actorRole: actor.role,
        action: "STUDENT_ARCHIVED",
        entityType: "student",
        entityId: id,
        oldValues: { status: current.status, deletedAt: current.deletedAt },
        newValues: { status: row.status, deletedAt: row.deletedAt },
        changedFields: ["status", "deletedAt"],
        details: { reason },
        riskLevel: "HIGH",
      });
      return shape(row);
    });
  }

  async restore(id: string, actor: Actor, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new StudentsRepository(tx);
      const current = await repo.findByIdIncludingArchived(id);
      if (!current) throw new ServiceError("Student not found.", 404, "NOT_FOUND");
      if (!current.deletedAt) return shape(current);
      const row = await repo.restore(id);
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "STUDENT_RESTORED", entityType: "student", entityId: id, oldValues: { status: current.status, deletedAt: current.deletedAt }, newValues: { status: row.status, deletedAt: null }, changedFields: ["status", "deletedAt"], details: { reason }, riskLevel: "HIGH" });
      return shape(row);
    });
  }

  async deletionEligibility(id: string) {
    const student = await new StudentsRepository(this.prisma).findByIdIncludingArchived(id);
    if (!student) throw new ServiceError("Student not found.", 404, "NOT_FOUND");
    const account = await this.prisma.financeAccount.findUnique({ where: { studentId: id } });
    const customer = await this.prisma.accountingCustomer.findUnique({ where: { studentId: id } });
    const [invoices, payments, journals, inventoryMovements, documents, directCosts, installments] = await Promise.all([
      this.prisma.financeInvoice.count({ where: { account: { studentId: id }, deletedAt: null } }),
      this.prisma.financePayment.count({ where: { account: { studentId: id }, deletedAt: null } }),
      this.prisma.journalEntry.count({ where: { OR: [{ invoice: { account: { studentId: id } } }, { payment: { account: { studentId: id } } }], deletedAt: null } }),
      this.prisma.stockMovement.count({ where: { studentId: id, deletedAt: null } }),
      this.prisma.uploadedFile.count({ where: { ownerId: { in: [id, student.registrationId || "00000000-0000-0000-0000-000000000000"] }, deletedAt: null } }),
      this.prisma.directCostEvent.count({ where: { studentId: id } }),
      customer ? this.prisma.installment.count({ where: { customerId: customer.id } }) : Promise.resolve(0),
    ]);
    const counts = { invoices, payments, receipts: payments, journals, inventoryMovements, documents, directCosts, installments };
    const reasons = Object.entries(counts).filter(([, count]) => count > 0).map(([name, count]) => `${name}: ${count}`);
    return { studentId: id, registrationNumber: student.registrationNumber, displayName: student.arabicName || student.englishName, status: student.status, financeAccountId: account?.id || null, eligible: reasons.length === 0, counts, reasons };
  }

  async permanentlyDelete(id: string, input: { reason: string; confirmation: string }, actor: Actor) {
    const eligibility = await this.deletionEligibility(id);
    if (!eligibility.eligible)
      throw new ServiceError(`Permanent deletion is blocked. ${eligibility.reasons.join(", ")}`, 422, "STUDENT_DELETE_BLOCKED");
    if (![eligibility.registrationNumber, eligibility.displayName].filter(Boolean).includes(input.confirmation))
      throw new ServiceError("Confirmation must exactly match the registration number or student name.", 422, "DELETE_CONFIRMATION_MISMATCH");
    return this.prisma.$transaction(async (tx) => {
      const student = await new StudentsRepository(tx).findByIdIncludingArchived(id);
      if (!student) return { deleted: true, alreadyDeleted: true };
      const customer = await tx.accountingCustomer.findUnique({ where: { studentId: id } });
      const financeAccount = await tx.financeAccount.findUnique({ where: { studentId: id } });
      if (financeAccount) await tx.financeAccount.delete({ where: { id: financeAccount.id } });
      if (customer) {
        const receivableId = customer.receivableAccountId;
        await tx.accountingCustomer.delete({ where: { id: customer.id } });
        await tx.chartOfAccount.delete({ where: { id: receivableId } });
      }
      if (student.registrationId) await tx.registration.update({ where: { id: student.registrationId }, data: { status: "under_review" } });
      await tx.student.delete({ where: { id } });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "STUDENT_PERMANENTLY_DELETED", entityType: "student_tombstone", entityId: id, entityReference: student.registrationNumber, details: { registrationNumber: student.registrationNumber, displayName: student.arabicName || student.englishName, reason: input.reason }, riskLevel: "CRITICAL" });
      return { deleted: true, alreadyDeleted: false };
    });
  }

  async auditHistory(id: string) {
    return this.prisma.auditLog.findMany({ where: { entityType: { in: ["student", "student_tombstone"] }, entityId: id }, orderBy: { createdAt: "desc" } });
  }

  private async assertPermission(tx: any, actor: Actor, permissionCode: string) {
    if (actor.role === "Super Admin") return;
    const allowed = await tx.rolePermission.findFirst({ where: { role: { name: actor.role }, permission: { code: permissionCode } }, select: { roleId: true } });
    if (!allowed) throw new ServiceError("Permission denied.", 403, "PERMISSION_DENIED");
  }
}

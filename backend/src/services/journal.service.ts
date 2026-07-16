import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { JournalsRepository } from "../repositories/journals.repository.js";
import type { DatabaseClient } from "../repositories/repository.types.js";
import { ServiceError } from "./service.error.js";
import { AuditRepository } from "../repositories/audit.repository.js";

export interface PostingLine {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string;
  costCenterId?: string;
}
export interface Posting {
  referenceNumber?: string;
  postingDate: string | Date;
  description: string;
  sourceType: string;
  sourceId: string;
  invoiceId?: string;
  paymentId?: string;
  status?: string;
  sourceModule?: string;
  sourceTransactionNumber?: string;
  postingEventType?: string;
  idempotencyKey?: string;
  notes?: string;
  attachmentUrl?: string;
  currency?: string;
  exchangeRate?: number;
  recurring?: boolean;
  automatic?: boolean;
  lines: PostingLine[];
}
const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
const shape = (entry: any) => ({
  ...entry,
  postingDate: entry.postingDate.toISOString(),
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt.toISOString(),
  lines: entry.lines.map((line: any) => ({
    ...line,
    debit: Number(line.debit),
    credit: Number(line.credit),
  })),
});

export class JournalService {
  constructor(private readonly prisma: PrismaClient) {}
  static async postUsing(
    db: DatabaseClient,
    input: Posting,
    actor: Actor = {},
  ) {
    if (!input.sourceType || !input.sourceId)
      throw new ServiceError("Journal source is required.", 422);
    const debit = input.lines.reduce((n, line) => n + cents(line.debit), 0);
    const credit = input.lines.reduce((n, line) => n + cents(line.credit), 0);
    if (input.lines.length < 2 || debit <= 0 || debit !== credit)
      throw new ServiceError("Journal entry must balance.", 422);
    if (
      input.lines.some(
        (line) =>
          cents(line.debit) < 0 ||
          cents(line.credit) < 0 ||
          cents(line.debit) > 0 === cents(line.credit) > 0,
      )
    )
      throw new ServiceError(
        "Each journal line must contain either a debit or a credit.",
        422,
      );
    const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
    const postingAccounts = await db.chartOfAccount.findMany({
      where: { id: { in: accountIds }, active: true, deletedAt: null },
      select: { id: true, allowPosting: true, allowManualJournal: true },
    });
    if (
      postingAccounts.length !== accountIds.length ||
      postingAccounts.some(
        (account) =>
          !account.allowPosting ||
          (input.sourceType === "manual_journal" &&
            !account.allowManualJournal),
      )
    )
      throw new ServiceError(
        "Journal contains an archived or non-posting account.",
        422,
        "ACCOUNT_NOT_POSTABLE",
      );
    const repo = new JournalsRepository(db);
    const existing = await repo.bySource(input.sourceType, input.sourceId);
    if (existing) return shape(existing);
    const branch = await db.branch.findFirst({
      where: { active: true, deletedAt: null },
    });
    if (!branch)
      throw new ServiceError("Active branch is not configured.", 422);
    await ensureOpenPeriod(db, branch.id, new Date(input.postingDate), actor.role);
    const prefix = `JE-${new Date(input.postingDate).getFullYear()}-`;
    const latest = await repo.nextNumber(prefix);
    const next = Number(latest?.entryNumber.slice(prefix.length) || 0) + 1;
    const entry = await repo.create(
      {
        id: randomUUID(),
        entryNumber: `${prefix}${String(next).padStart(8, "0")}`,
        branchId: branch.id,
        postingDate: new Date(input.postingDate),
        journalDate: new Date(input.postingDate),
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceModule: input.sourceModule || input.sourceType.split("_")[0],
        sourceTransactionNumber: input.sourceTransactionNumber || input.referenceNumber,
        postingEventType: input.postingEventType || input.sourceType.toUpperCase(),
        idempotencyKey: input.idempotencyKey,
        automatic: input.automatic ?? input.sourceType !== "manual_journal",
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        attachmentUrl: input.attachmentUrl,
        currency: input.currency || "SAR",
        exchangeRate: input.exchangeRate || 1,
        recurring: input.recurring || false,
        invoiceId: input.invoiceId,
        paymentId: input.paymentId,
        createdById: actor.id,
        status:
          String(input.status || "POSTED").toUpperCase() === "DRAFT"
            ? "DRAFT"
            : "POSTED",
        postedAt:
          String(input.status || "POSTED").toUpperCase() === "DRAFT"
            ? null
            : new Date(),
        postedById: String(input.status || "POSTED").toUpperCase() === "DRAFT" ? null : actor.id,
      },
      input.lines.map((line) => ({
        id: randomUUID(),
        accountId: line.accountId,
        costCenterId: line.costCenterId,
        description: line.description,
        debit: line.debit || 0,
        credit: line.credit || 0,
      })),
    );
    return shape(entry);
  }
  async post(input: Posting, actor: Actor = {}) {
    const normalized = {
      ...input,
      sourceType: input.sourceType || "manual_journal",
      sourceId: input.sourceId || randomUUID(),
      automatic: input.automatic ?? Boolean(input.sourceType && input.sourceType !== "manual_journal"),
      status: input.status || (input.sourceType && input.sourceType !== "manual_journal" ? "POSTED" : "DRAFT"),
    };
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => JournalService.postUsing(tx, normalized, actor),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 30_000,
          },
        );
      } catch (error: any) {
        lastError = error;
        if (!["P2002", "P2034"].includes(String(error?.code || "")))
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 75 * (attempt + 1)),
        );
        const existing = await new JournalsRepository(this.prisma).bySource(
          normalized.sourceType,
          normalized.sourceId,
        );
        if (existing) return shape(existing);
      }
    }
    throw lastError;
  }

  async updateManual(id: string, input: Posting, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.journalEntry.findFirst({
        where: { id, deletedAt: null },
      });
      if (!current || current.sourceType !== "manual_journal")
        throw new ServiceError("Manual journal entry not found.", 404);
      if (current.status !== "DRAFT")
        throw new ServiceError("Only draft journal entries can be edited. Use Correct Entry for a posted journal.", 409, "POSTED_JOURNAL_IMMUTABLE");
      if (current.reversedFromId)
        throw new ServiceError("Reversal entries cannot be edited.", 422);
      const debit = input.lines.reduce((sum, line) => sum + cents(line.debit), 0);
      const credit = input.lines.reduce(
        (sum, line) => sum + cents(line.credit),
        0,
      );
      if (input.lines.length < 2 || debit <= 0 || debit !== credit)
        throw new ServiceError("Journal entry must balance.", 422);
      const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
      const accounts = await tx.chartOfAccount.findMany({
        where: {
          id: { in: accountIds },
          active: true,
          deletedAt: null,
          allowPosting: true,
          allowManualJournal: true,
        },
      });
      if (accounts.length !== accountIds.length)
        throw new ServiceError(
          "Journal contains an archived or non-posting account.",
          422,
          "ACCOUNT_NOT_POSTABLE",
        );
      await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
      await ensureOpenPeriod(tx, current.branchId, new Date(input.postingDate), actor.role);
      const status = "DRAFT";
      await tx.journalEntry.update({
        where: { id },
        data: {
          postingDate: new Date(input.postingDate),
          description: input.description,
          referenceNumber: input.referenceNumber,
          status,
          postedAt: null,
          createdById: actor.id,
          lines: {
            create: input.lines.map((line) => ({
              id: randomUUID(),
              accountId: line.accountId,
              description: line.description,
              costCenterId: line.costCenterId,
              debit: line.debit || 0,
              credit: line.credit || 0,
            })),
          },
        },
      });
      const updated = await new JournalsRepository(tx).find(id);
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "edit draft journal", entityType: "journal_entry", entityId: id, riskLevel: "MEDIUM", oldValues: current as any, newValues: { postingDate: input.postingDate, description: input.description, referenceNumber: input.referenceNumber, lines: input.lines } as any, changedFields: ["postingDate", "description", "referenceNumber", "lines"] });
      return shape(updated);
    });
  }

  async deleteManual(id: string, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.journalEntry.findFirst({
        where: { id, deletedAt: null },
      });
      if (!current || current.sourceType !== "manual_journal")
        throw new ServiceError("Manual journal entry not found.", 404);
      if (current.reversedFromId)
        throw new ServiceError("Reversal entries cannot be deleted.", 422);
      if (current.status !== "DRAFT") throw new ServiceError("Only draft journals can be cancelled.", 409, "POSTED_JOURNAL_IMMUTABLE");
      await tx.journalEntry.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "cancel draft journal", entityType: "journal_entry", entityId: id, riskLevel: "MEDIUM", oldValues: { status: current.status }, newValues: { status: "CANCELLED" }, changedFields: ["status"] });
    });
  }
  async list(skip = 0, take = 100) {
    return (await new JournalsRepository(this.prisma).list({}, skip, take)).map(
      shape,
    );
  }
  async details(id: string) {
    const entry = await new JournalsRepository(this.prisma).find(id);
    if (!entry) throw new ServiceError("Journal entry not found.", 404, "NOT_FOUND");
    const audit = await this.prisma.auditLog.findMany({
      where: { entityType: "journal_entry", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { ...shape(entry), audit };
  }

  async summary() {
    const [groups, automatic, manual, unbalanced] = await Promise.all([
      this.prisma.journalEntry.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.journalEntry.count({ where: { deletedAt: null, automatic: true } }),
      this.prisma.journalEntry.count({ where: { deletedAt: null, automatic: false } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) count FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id WHERE je.status IN ('DRAFT','SUBMITTED','APPROVED') AND je.deleted_at IS NULL GROUP BY je.id HAVING COALESCE(SUM(jl.debit),0) <> COALESCE(SUM(jl.credit),0)) q`,
    ]);
    const statuses = Object.fromEntries(groups.map((row) => [row.status.toLowerCase(), row._count._all]));
    return { ...statuses, automatic, manual, unbalancedDrafts: Number(unbalanced[0]?.count || 0) };
  }
  static async reverseUsing(
    db: DatabaseClient,
    id: string,
    actor: Actor = {},
    sourceType = "journal_reversal",
  ) {
    const repo = new JournalsRepository(db);
    const original = await repo.find(id);
    if (!original || original.status !== "POSTED")
      throw new ServiceError("Posted journal entry not found.", 404);
    if (original.reversal) {
      const existing = await repo.find(original.reversal.id);
      if (existing) return shape(existing);
    }
    const reversal = await JournalService.postUsing(
      db,
      {
        postingDate: new Date(),
        description: `Reversal: ${original.description}`,
        sourceType,
        sourceId: original.id,
        referenceNumber: original.entryNumber,
        lines: original.lines.map((line) => ({
          accountId: line.accountId,
          costCenterId: line.costCenterId || undefined,
          debit: Number(line.credit),
          credit: Number(line.debit),
          description: line.description || undefined,
        })),
      },
      actor,
    );
    await db.journalEntry.update({
      where: { id: reversal.id },
      data: { reversedFromId: original.id },
    });
    await db.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED" } });
    await new AuditRepository(db).create({ actorId: actor.id, actorRole: actor.role, action: "reverse journal", entityType: "journal_entry", entityId: original.id, riskLevel: "HIGH", details: { reversalId: reversal.id } });
    return reversal;
  }
  async reverse(id: string, actor: Actor = {}) {
    const entry = await new JournalsRepository(this.prisma).find(id);
    if (!entry) throw new ServiceError("Posted journal entry not found.", 404, "NOT_FOUND");
    if (entry.automatic)
      throw new ServiceError("Reverse the operational source transaction instead of reversing its automatic journal directly.", 422, "SOURCE_REVERSAL_REQUIRED");
    return this.prisma.$transaction(
      (tx) => JournalService.reverseUsing(tx, id, actor),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  async transition(id: string, action: "submit" | "approve" | "post" | "cancel", actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await new JournalsRepository(tx).find(id);
      if (!entry) throw new ServiceError("Journal entry not found.", 404, "NOT_FOUND");
      const next = action === "submit" ? "SUBMITTED" : action === "approve" ? "APPROVED" : action === "post" ? "POSTED" : "CANCELLED";
      const allowed: Record<string, string[]> = { submit: ["DRAFT"], approve: ["SUBMITTED"], post: ["DRAFT", "SUBMITTED", "APPROVED"], cancel: ["DRAFT", "SUBMITTED", "APPROVED"] };
      if (!allowed[action].includes(entry.status)) throw new ServiceError(`Journal cannot be ${action}ed from ${entry.status}.`, 409, "INVALID_JOURNAL_STATE");
      if (action === "approve") {
        const settings = await tx.securitySetting.findUnique({ where: { id: "default" } });
        if (settings?.segregationOfDuties && entry.createdById === actor.id) throw new ServiceError("Maker-checker policy prevents the creator from approving this journal.", 403, "SEGREGATION_OF_DUTIES");
      }
      if (action === "post") await ensureOpenPeriod(tx, entry.branchId, entry.postingDate, actor.role);
      const updated = await tx.journalEntry.update({ where: { id }, data: { status: next as any, submittedAt: action === "submit" ? new Date() : entry.submittedAt, approvedAt: action === "approve" ? new Date() : entry.approvedAt, approvedById: action === "approve" ? actor.id : entry.approvedById, postedAt: action === "post" ? new Date() : entry.postedAt, postedById: action === "post" ? actor.id : entry.postedById } });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: `${action} journal`, entityType: "journal_entry", entityId: id, riskLevel: action === "post" || action === "approve" ? "HIGH" : "MEDIUM", oldValues: { status: entry.status }, newValues: { status: next }, changedFields: ["status"] });
      return new JournalsRepository(tx).find(updated.id).then(shape);
    });
  }

  async correctPosted(id: string, input: Posting | undefined, reason: string, accountingOnly: boolean, actor: Actor = {}) {
    if (!reason?.trim() || reason.trim().length < 10) throw new ServiceError("A correction reason of at least 10 characters is required.", 400, "CORRECTION_REASON_REQUIRED");
    return this.prisma.$transaction(async (tx) => {
      const original = await new JournalsRepository(tx).find(id);
      if (!original || original.status !== "POSTED") throw new ServiceError("Posted journal entry not found.", 404, "NOT_FOUND");
      if (original.automatic && !accountingOnly) throw new ServiceError("Correct the source transaction first, or explicitly request an authorized accounting-only correction.", 422, "SOURCE_CORRECTION_REQUIRED");
      const reversal = await JournalService.reverseUsing(tx, id, actor, "journal_correction_reversal");
      const correctionInput: Posting = input || { postingDate: original.postingDate, description: `Corrected: ${original.description}`, sourceType: "journal_correction", sourceId: `${original.id}:${randomUUID()}`, referenceNumber: original.entryNumber, status: "DRAFT", automatic: false, lines: original.lines.map((line) => ({ accountId: line.accountId, costCenterId: line.costCenterId || undefined, debit: Number(line.debit), credit: Number(line.credit), description: line.description || undefined })) };
      const corrected = await JournalService.postUsing(tx, { ...correctionInput, sourceType: "journal_correction", sourceId: correctionInput.sourceId || `${original.id}:${randomUUID()}`, status: "DRAFT", automatic: false, postingEventType: "JOURNAL_CORRECTED" }, actor);
      await tx.journalEntry.update({ where: { id: corrected.id }, data: { correctedFromId: original.id, correctionReason: reason.trim() } });
      await new AuditRepository(tx).create({ actorId: actor.id, actorRole: actor.role, action: "correct posted journal", entityType: "journal_entry", entityId: original.id, riskLevel: "HIGH", oldValues: { entryNumber: original.entryNumber, lines: original.lines } as any, newValues: { reversalId: reversal.id, correctedId: corrected.id, lines: correctionInput.lines } as any, changedFields: ["reversal", "correctedEntry"], details: { reason: reason.trim(), accountingOnly, automaticSource: original.automatic } });
      return { original: await new JournalsRepository(tx).find(original.id).then(shape), reversal, corrected: await new JournalsRepository(tx).find(corrected.id).then(shape) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }
}

async function ensureOpenPeriod(db: DatabaseClient, branchId: string, date: Date, role?: string) {
  const period = await db.accountingPeriod.findFirst({ where: { branchId, startsAt: { lte: date }, endsAt: { gte: date } } });
  if (!period) return;
  if (period.status === "CLOSED") throw new ServiceError("The accounting period is closed.", 409, "ACCOUNTING_PERIOD_CLOSED");
  if (period.status === "SOFT_CLOSED" && !["Super Admin", "Finance Manager", "Chief Accountant"].includes(String(role || ""))) throw new ServiceError("The accounting period is soft closed.", 403, "ACCOUNTING_PERIOD_SOFT_CLOSED");
}

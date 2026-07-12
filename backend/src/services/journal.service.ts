import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { JournalsRepository } from "../repositories/journals.repository.js";
import type { DatabaseClient } from "../repositories/repository.types.js";
import { ServiceError } from "./service.error.js";

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
    if (!input.lines.length || debit <= 0 || debit !== credit)
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
    const repo = new JournalsRepository(db);
    const existing = await repo.bySource(input.sourceType, input.sourceId);
    if (existing) return shape(existing);
    const branch = await db.branch.findFirst({
      where: { active: true, deletedAt: null },
    });
    if (!branch)
      throw new ServiceError("Active branch is not configured.", 422);
    const prefix = `JE-${new Date(input.postingDate).getFullYear()}-`;
    const latest = await repo.nextNumber(prefix);
    const next = Number(latest?.entryNumber.slice(prefix.length) || 0) + 1;
    const entry = await repo.create(
      {
        id: randomUUID(),
        entryNumber: `${prefix}${String(next).padStart(8, "0")}`,
        branchId: branch.id,
        postingDate: new Date(input.postingDate),
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        referenceNumber: input.referenceNumber,
        invoiceId: input.invoiceId,
        paymentId: input.paymentId,
        createdById: actor.id,
        status: "POSTED",
        postedAt: new Date(),
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
    return this.prisma.$transaction(
      (tx) => JournalService.postUsing(tx, input, actor),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async list(skip = 0, take = 100) {
    return (await new JournalsRepository(this.prisma).list({}, skip, take)).map(
      shape,
    );
  }
  async reverse(id: string, actor: Actor = {}) {
    return this.prisma.$transaction(async (tx) => {
      const repo = new JournalsRepository(tx);
      const original = await repo.find(id);
      if (!original || original.status !== "POSTED")
        throw new ServiceError("Posted journal entry not found.", 404);
      const reversal = await JournalService.postUsing(
        tx,
        {
          postingDate: new Date(),
          description: `Reversal: ${original.description}`,
          sourceType: "journal_reversal",
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
      await tx.journalEntry.update({
        where: { id: reversal.id },
        data: { reversedFromId: original.id },
      });
      await tx.journalEntry.update({
        where: { id: original.id },
        data: { status: "REVERSED" },
      });
      return reversal;
    });
  }
}

import type { Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export class JournalsRepository {
  constructor(private readonly db: DatabaseClient) {}
  bySource(sourceType: string, sourceId: string) {
    return this.db.journalEntry.findFirst({
      where: { sourceType, sourceId },
      include: { lines: true },
    });
  }
  find(id: string) {
    return this.db.journalEntry.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { include: { account: true, costCenter: true } } },
    });
  }
  list(where: Prisma.JournalEntryWhereInput = {}, skip = 0, take = 100) {
    return this.db.journalEntry.findMany({
      where: { deletedAt: null, ...where },
      include: { lines: { include: { account: true, costCenter: true } } },
      orderBy: [{ postingDate: "desc" }, { entryNumber: "desc" }],
      skip,
      take,
    });
  }
  create(
    data: Prisma.JournalEntryUncheckedCreateInput,
    lines: Prisma.JournalLineUncheckedCreateWithoutJournalEntryInput[],
  ) {
    return this.db.journalEntry.create({
      data: { ...data, lines: { create: lines } },
      include: { lines: true },
    });
  }
  nextNumber(prefix: string) {
    return this.db.journalEntry.findFirst({
      where: { entryNumber: { startsWith: prefix } },
      orderBy: { entryNumber: "desc" },
      select: { entryNumber: true },
    });
  }
  unbalanced() {
    return this.db.$queryRaw<
      Array<{
        id: string;
        entry_number: string;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
      }>
    >`SELECT je.id, je.entry_number, COALESCE(SUM(jl.debit),0) debit, COALESCE(SUM(jl.credit),0) credit FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id WHERE je.status='POSTED' AND je.deleted_at IS NULL GROUP BY je.id, je.entry_number HAVING COALESCE(SUM(jl.debit),0) <> COALESCE(SUM(jl.credit),0)`;
  }
  duplicateSources() {
    return this.db.$queryRaw<
      Array<{ source_type: string; source_id: string; count: bigint }>
    >`SELECT source_type, source_id, COUNT(*) count FROM journal_entries WHERE source_type IS NOT NULL AND source_id IS NOT NULL GROUP BY source_type, source_id HAVING COUNT(*) > 1`;
  }
}

import type { AccountType, JournalStatus, Prisma } from "@prisma/client";
import type { DatabaseClient } from "./repository.types.js";

export interface LedgerFilter {
  from?: Date;
  to?: Date;
  accountId?: string;
  accountTypes?: AccountType[];
}
export class LedgerRepository {
  constructor(private readonly db: DatabaseClient) {}
  lines(filter: LedgerFilter = {}) {
    return this.db.journalLine.findMany({
      where: {
        accountId: filter.accountId,
        account: filter.accountTypes
          ? { type: { in: filter.accountTypes } }
          : undefined,
        journalEntry: {
          status: "POSTED" as JournalStatus,
          deletedAt: null,
          postingDate: { gte: filter.from, lte: filter.to },
        },
      },
      include: { account: true, journalEntry: true, costCenter: true },
      orderBy: [{ journalEntry: { postingDate: "asc" } }, { createdAt: "asc" }],
    });
  }
  balances(filter: LedgerFilter = {}) {
    return this.db.journalLine.groupBy({
      by: ["accountId"],
      where: {
        account: filter.accountTypes
          ? { type: { in: filter.accountTypes } }
          : undefined,
        journalEntry: {
          status: "POSTED",
          deletedAt: null,
          postingDate: { gte: filter.from, lte: filter.to },
        },
      },
      _sum: { debit: true, credit: true },
    });
  }
  invoicesWithoutJournals() {
    return this.db.financeInvoice.findMany({
      where: {
        deletedAt: null,
        journalEntries: { none: { status: "POSTED" } },
      },
      select: { id: true, invoiceNumber: true },
    });
  }
  paymentsWithoutJournals() {
    return this.db.financePayment.findMany({
      where: {
        deletedAt: null,
        status: "COMPLETED",
        journalEntries: { none: { status: "POSTED" } },
      },
      select: { id: true, receiptNumber: true },
    });
  }
}

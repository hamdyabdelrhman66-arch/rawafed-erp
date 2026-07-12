import type { DatabaseClient } from "./repository.types.js";

export class AccountingSearchRepository {
  constructor(private readonly db: DatabaseClient) {}
  async search(query: string) {
    const contains = { contains: query, mode: "insensitive" as const };
    const [accounts, customers, suppliers, journals] = await Promise.all([
      this.db.chartOfAccount.findMany({
        where: {
          deletedAt: null,
          OR: [{ code: contains }, { name: contains }, { nameAr: contains }],
        },
        take: 20,
      }),
      this.db.accountingCustomer.findMany({
        where: {
          deletedAt: null,
          OR: [
            { customerCode: contains },
            { nameEn: contains },
            { nameAr: contains },
          ],
        },
        take: 20,
      }),
      this.db.accountingSupplier.findMany({
        where: {
          deletedAt: null,
          OR: [
            { supplierCode: contains },
            { nameEn: contains },
            { nameAr: contains },
          ],
        },
        take: 20,
      }),
      this.db.journalEntry.findMany({
        where: {
          deletedAt: null,
          OR: [
            { entryNumber: contains },
            { referenceNumber: contains },
            { description: contains },
          ],
        },
        take: 20,
      }),
    ]);
    return { accounts, customers, suppliers, journals };
  }
}

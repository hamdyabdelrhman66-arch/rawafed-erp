import type { PrismaClient } from "@prisma/client";
import { LedgerRepository } from "../repositories/ledger.repository.js";

export class VatService {
  constructor(private readonly prisma: PrismaClient) {}
  async summary(from?: string, to?: string) {
    const lines = await new LedgerRepository(this.prisma).lines({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    const vat = lines.filter((l) => l.account.isVatAccount);
    const outputVat = vat.reduce((n, l) => n + Number(l.credit), 0),
      inputVat = vat.reduce((n, l) => n + Number(l.debit), 0);
    return {
      outputVat,
      inputVat,
      vatPayable: Math.round((outputVat - inputVat) * 100) / 100,
    };
  }
}

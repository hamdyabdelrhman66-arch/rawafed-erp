import type { PrismaClient } from "@prisma/client";
import type { Actor } from "../dto/core.dto.js";
import { CashBankRepository } from "../repositories/cash-bank.repository.js";
import { JournalService } from "./journal.service.js";
import { ServiceError } from "./service.error.js";

export class CashBankService {
  constructor(private readonly prisma: PrismaClient) {}
  cashboxes() {
    return new CashBankRepository(this.prisma).cashboxes();
  }
  banks() {
    return new CashBankRepository(this.prisma).banks();
  }
  createCashbox(input: any) {
    return new CashBankRepository(this.prisma).createCashbox({
      accountId: input.accountId,
      name: input.name,
      notes: input.notes,
    });
  }
  createBank(input: any) {
    return new CashBankRepository(this.prisma).createBank({
      accountId: input.accountId,
      bankName: input.bankName,
      iban: input.iban,
      accountNumber: input.accountNumber,
      notes: input.notes,
    });
  }
  updateCashbox(id: string, input: any) {
    return new CashBankRepository(this.prisma).updateCashbox(id, {
      name: input.name,
      active: input.status ? input.status === "active" : undefined,
      notes: input.notes,
    });
  }
  updateBank(id: string, input: any) {
    return new CashBankRepository(this.prisma).updateBank(id, {
      bankName: input.bankName,
      iban: input.iban,
      accountNumber: input.accountNumber,
      active: input.status ? input.status === "active" : undefined,
      notes: input.notes,
    });
  }
  async transfer(input: any, actor: Actor) {
    if (input.fromAccountId === input.toAccountId)
      throw new ServiceError("Transfer accounts must be different.", 422);
    return this.prisma.$transaction(async (tx) => {
      const journal = await JournalService.postUsing(
        tx,
        {
          postingDate: input.transferDate || new Date(),
          description: `Transfer ${input.transferNumber}`,
          referenceNumber: input.transferNumber,
          sourceType: "cash_bank_transfer",
          sourceId: input.idempotencyKey || input.transferNumber,
          lines: [
            { accountId: input.toAccountId, debit: Number(input.amount) },
            { accountId: input.fromAccountId, credit: Number(input.amount) },
          ],
        },
        actor,
      );
      return new CashBankRepository(tx).createTransfer({
        transferNumber: input.transferNumber,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: Number(input.amount),
        transferDate: new Date(input.transferDate || Date.now()),
        journalEntryId: journal.id,
        notes: input.notes,
      });
    });
  }
}

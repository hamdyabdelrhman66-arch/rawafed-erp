import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { AccountService } from "../src/services/account.service.js";
import { AccountingExpenseService } from "../src/services/accounting-expense.service.js";
import { CashBankService } from "../src/services/cash-bank.service.js";
import { JournalService } from "../src/services/journal.service.js";
import { PayablesService } from "../src/services/payables.service.js";

class RollbackOperationalFixture extends Error {}

describe("frontend/backend operational contracts", () => {
  it("supports cash, bank, supplier, expense, and manual-journal workflows", async () => {
    const observed: Record<string, unknown> = {};
    await expect(
      prisma.$transaction(
        async (tx) => {
          const suffix = randomUUID().slice(0, 8);
          const nestedClient = new Proxy(tx as unknown as PrismaClient, {
            get(target, property, receiver) {
              if (property === "$transaction") {
                return async (
                  operation: (client: Prisma.TransactionClient) => unknown,
                ) => operation(tx);
              }
              return Reflect.get(target, property, receiver);
            },
          });

          const cashBank = new CashBankService(nestedClient);
          const cashbox = await cashBank.createCashbox({
            name: `Test Cashbox ${suffix}`,
            openingBalance: 1000,
            status: "active",
          });
          const bank = await cashBank.createBank({
            bankName: `Test Bank ${suffix}`,
            openingBalance: 2000,
            status: "active",
          });
          const paymentAccounts = await new AccountService(
            nestedClient,
          ).paymentAccounts();
          observed.filteredPaymentAccounts =
            paymentAccounts.some((account) => account.id === cashbox.accountId) &&
            paymentAccounts.some((account) => account.id === bank.accountId);

          const transfer = await cashBank.transfer(
            {
              fromAccountId: bank.accountId,
              toAccountId: cashbox.accountId,
              amount: 200,
              date: "2026-07-13",
              description: "Working cash",
            },
            {},
          );
          observed.transferNumber = transfer.transferNumber.startsWith("TRF-");

          const payables = new PayablesService(nestedClient);
          const supplier = await payables.create({
            name: `Test Supplier ${suffix}`,
          });
          observed.supplierAccountCreated = Boolean(
            supplier.payableAccountId && supplier.payableAccount,
          );
          const supplierPayment = await payables.payment(
            {
              supplierId: supplier.id,
              amount: 50,
              paymentAccountId: cashbox.accountId,
              paidAt: "2026-07-13",
            },
            {},
          );
          observed.supplierPaymentNumber =
            supplierPayment.paymentNo.startsWith("SP-");

          const expenseAccount = await tx.chartOfAccount.create({
            data: {
              code: `EXP-${suffix}`,
              name: "Operational Test Expense",
              type: "EXPENSE",
            },
          });
          const expense = await new AccountingExpenseService(
            nestedClient,
          ).create(
            {
              expenseAccountId: expenseAccount.id,
              supplierId: supplier.id,
              description: "Partially paid supplies",
              amountBeforeVat: 100,
              vatAmount: 0,
              paymentStatus: "Partially Paid",
              paidAmount: 40,
              paymentFromAccountId: cashbox.accountId,
              expenseDate: "2026-07-13",
            },
            {},
          );
          const expenseJournal = await tx.journalEntry.findUniqueOrThrow({
            where: { id: expense.journalEntryId },
            include: { lines: true },
          });
          observed.partialExpenseCredits = expenseJournal.lines
            .filter((line) => Number(line.credit) > 0)
            .map((line) => Number(line.credit))
            .sort((a, b) => a - b);

          const journals = new JournalService(nestedClient);
          const manual = await journals.post(
            {
              postingDate: "2026-07-13",
              description: "Manual operational test",
              sourceType: "",
              sourceId: "",
              status: "draft",
              lines: [
                { accountId: cashbox.accountId, debit: 25 },
                { accountId: bank.accountId, credit: 25 },
              ],
            },
            {},
          );
          observed.manualCreated =
            manual.sourceType === "manual_journal" && manual.status === "DRAFT";
          const updated = await journals.updateManual(
            manual.id,
            {
              postingDate: "2026-07-14",
              description: "Updated manual operational test",
              sourceType: "manual_journal",
              sourceId: manual.sourceId,
              status: "posted",
              lines: [
                { accountId: cashbox.accountId, debit: 30 },
                { accountId: bank.accountId, credit: 30 },
              ],
            },
            {},
          );
          observed.manualUpdated =
            updated.description === "Updated manual operational test" &&
            updated.status === "POSTED";
          await journals.deleteManual(manual.id);
          observed.manualDeleted = Boolean(
            (await tx.journalEntry.findUnique({ where: { id: manual.id } }))
              ?.deletedAt,
          );

          throw new RollbackOperationalFixture();
        },
        { timeout: 120_000 },
      ),
    ).rejects.toBeInstanceOf(RollbackOperationalFixture);

    expect(observed).toEqual({
      filteredPaymentAccounts: true,
      transferNumber: true,
      supplierAccountCreated: true,
      supplierPaymentNumber: true,
      partialExpenseCredits: [40, 60],
      manualCreated: true,
      manualUpdated: true,
      manualDeleted: true,
    });
  }, 120_000);
});

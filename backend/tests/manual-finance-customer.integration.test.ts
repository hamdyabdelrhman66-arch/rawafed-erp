import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { FinanceService } from "../src/services/finance.service.js";
import { ReceivablesService } from "../src/services/receivables.service.js";

class RollbackManualCustomer extends Error {}

describe("manual finance customer", () => {
  it("creates a child account with fees and supports normal invoice/payment posting", async () => {
    const observed = { type: "", workerType: "", workerPosition: "", grossFees: 0, feeItems: 0, invoices: 0, payments: 0, journals: 0 };
    await expect(prisma.$transaction(async (tx) => {
      const nestedClient = new Proxy(tx as unknown as PrismaClient, {
        get(target, property, receiver) {
          if (property === "$transaction")
            return async (operation: (client: Prisma.TransactionClient) => unknown) => operation(tx);
          return Reflect.get(target, property, receiver);
        },
      });
      const suffix = randomUUID().replace(/\D/g, "").padEnd(9, "7").slice(0, 9);
      const customer = await new ReceivablesService(nestedClient).createManualCustomer({
        customerType: "CHILD",
        nameAr: "طفل مالي تجريبي",
        nameEn: "Manual Finance Child",
        identityType: "NATIONAL_ID",
        nationalId: `1${suffix}`,
        nationality: "سعودي",
        phone: "0500000000",
        grade: "Grade 1",
        guardianName: "Test Guardian",
        fees: [{ name: "Manual Tuition", category: "TUITION", amount: 1000 }],
      }, {});
      const account = await tx.financeAccount.findUniqueOrThrow({
        where: { studentId: customer.studentId },
        include: { feeItems: true },
      });
      observed.type = customer.customerType;
      observed.grossFees = Number(account.expectedTotal);
      observed.feeItems = account.feeItems.length;

      const payment = await new FinanceService(nestedClient).createPayment({
        accountId: account.id,
        receiptNumber: `REC-MAN-${randomUUID().slice(0, 8)}`,
        amount: 250,
        method: "Cash",
        lines: [{ feeItem: "Manual Tuition", amount: 250 }],
      }, {});
      observed.invoices = await tx.financeInvoice.count({ where: { accountId: account.id } });
      observed.payments = await tx.financePayment.count({ where: { id: payment.payment.id } });
      observed.journals = await tx.journalEntry.count({
        where: { OR: [{ invoice: { accountId: account.id } }, { paymentId: payment.payment.id }] },
      });

      const workerSuffix = randomUUID().replace(/\D/g, "").padEnd(9, "8").slice(0, 9);
      const worker = await new ReceivablesService(nestedClient).createManualCustomer({
        customerType: "WORKER",
        nameAr: "عامل مالي تجريبي",
        nameEn: "Manual Finance Worker",
        identityType: "NATIONAL_ID",
        nationalId: `1${workerSuffix}`,
        nationality: "سعودي",
        phone: "0500000001",
        position: "Driver",
        department: "Transportation",
        fees: [{ name: "Worker Service", category: "OTHER_SERVICES", amount: 500 }],
      }, {});
      observed.workerType = worker.customerType;
      observed.workerPosition = worker.position;
      throw new RollbackManualCustomer();
    }, { timeout: 120_000 })).rejects.toBeInstanceOf(RollbackManualCustomer);

    expect(observed).toEqual({ type: "CHILD", workerType: "WORKER", workerPosition: "Driver", grossFees: 1000, feeItems: 1, invoices: 1, payments: 1, journals: 2 });
  }, 120_000);
});

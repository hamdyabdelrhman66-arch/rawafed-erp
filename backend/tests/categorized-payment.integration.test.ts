import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/prisma/client.js";
import { FinanceService } from "../src/services/finance.service.js";

class RollbackCategorizedPayment extends Error {}

describe("categorized payment accounting", () => {
  it("creates separate invoices and one consolidated payment", async () => {
    const observed = { invoices: 0, allocations: 0, paid: 0, partial: 0, balanced: false };
    await expect(prisma.$transaction(async (tx) => {
      const suffix = randomUUID().slice(0, 8);
      const branch = await tx.branch.findFirstOrThrow({ where: { active: true, deletedAt: null } });
      const receivable = await tx.chartOfAccount.create({ data: {
        code: `CMR-${suffix}`, name: "Categorized Receivable", type: "ASSET", isReceivableAccount: true,
      } });
      const tuitionRevenue = await tx.chartOfAccount.create({ data: {
        code: `CMT-${suffix}`, name: "Categorized Tuition Revenue", type: "REVENUE", normalBalance: "CREDIT",
      } });
      const booksRevenue = await tx.chartOfAccount.create({ data: {
        code: `CMB-${suffix}`, name: "Categorized Books Revenue", type: "REVENUE", normalBalance: "CREDIT",
      } });
      await tx.revenueCategoryMapping.update({ where: { category: "TUITION" }, data: {
        revenueAccountId: tuitionRevenue.id, receivableAccountId: receivable.id, active: true,
      } });
      await tx.revenueCategoryMapping.update({ where: { category: "BOOKS" }, data: {
        revenueAccountId: booksRevenue.id, receivableAccountId: receivable.id, active: true,
      } });
      const registration = await tx.registration.create({ data: {
        registrationNumber: `CMP-${suffix}`, branchId: branch.id, status: "approved",
        studentName: "Mixed Payment Student", grade: "Grade 1", data: {},
      } });
      const student = await tx.student.create({ data: {
        registrationId: registration.id, registrationNumber: registration.registrationNumber,
        branchId: branch.id, englishName: "Mixed Payment Student", grade: "Grade 1", nationalId: "2123456789",
        profile: { student: { identityType: "IQAMA", nationalId: "2123456789", nationality: "Jordanian" } },
      } });
      const account = await tx.financeAccount.create({ data: {
        registrationId: registration.id, studentId: student.id, expectedTotal: 1380,
        feeItems: { create: [
          { name: "Tuition", serviceCategory: "TUITION", subtotal: 1000, vatAmount: 150, amount: 1150 },
          { name: "Books", serviceCategory: "BOOKS", subtotal: 200, vatAmount: 30, amount: 230 },
        ] },
      } });
      await tx.accountingCustomer.create({ data: {
        customerCode: `CMC-${suffix}`, studentId: student.id, registrationId: registration.id,
        registrationNumber: registration.registrationNumber, nameEn: student.englishName,
        receivableAccountId: receivable.id,
      } });
      const nestedClient = new Proxy(tx as unknown as PrismaClient, {
        get(target, property, receiver) {
          if (property === "$transaction")
            return async (operation: (client: Prisma.TransactionClient) => unknown) => operation(tx);
          return Reflect.get(target, property, receiver);
        },
      });
      const result = await new FinanceService(nestedClient).createPayment({
        accountId: account.id, receiptNumber: `REC-CMP-${suffix}`, amount: 805, method: "Cash",
        lines: [{ feeItem: "Tuition", amount: 575 }, { feeItem: "Books", amount: 230 }],
      }, {});
      const invoices = await tx.financeInvoice.findMany({ where: { accountId: account.id } });
      const payment = await tx.financePayment.findUniqueOrThrow({
        where: { id: result.payment.id }, include: { allocations: true },
      });
      const journals = await tx.journalEntry.findMany({
        where: { OR: [{ paymentId: payment.id }, { invoiceId: { in: invoices.map((row) => row.id) } }] },
        include: { lines: true },
      });
      observed.invoices = invoices.length;
      observed.allocations = payment.allocations.length;
      observed.paid = invoices.filter((row) => row.status === "PAID").length;
      observed.partial = invoices.filter((row) => row.status === "PARTIALLY_PAID").length;
      observed.balanced = journals.length === 3 && journals.every((journal) =>
        journal.lines.reduce((sum, line) => sum + Number(line.debit), 0) ===
        journal.lines.reduce((sum, line) => sum + Number(line.credit), 0));
      throw new RollbackCategorizedPayment();
    }, { timeout: 90_000 })).rejects.toBeInstanceOf(RollbackCategorizedPayment);
    expect(observed).toEqual({ invoices: 2, allocations: 2, paid: 1, partial: 1, balanced: true });
  }, 90_000);
});

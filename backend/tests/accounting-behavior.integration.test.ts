import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma/client.js';
import { FinanceService } from '../src/services/finance.service.js';

class RollbackFixture extends Error {}

describe('school fee accounting behavior', () => {
  it('recognizes revenue and VAT once and clears AR after full payment', async () => {
    const observed: Record<string, number> = {};

    await expect(
      prisma.$transaction(
        async (tx) => {
          const suffix = randomUUID().slice(0, 8);
          const branch =
            (await tx.branch.findFirst({ where: { active: true, deletedAt: null } })) ||
            (await tx.branch.create({ data: { code: `T-${suffix}`, name: 'Accounting Test Branch' } }));

          await tx.chartOfAccount.updateMany({
            where: { systemKey: { in: ['tuition-revenue', 'vat-payable', 'cash-main'] } },
            data: { systemKey: null },
          });
          const [receivable, cash, revenue, vatPayable] = await Promise.all([
            tx.chartOfAccount.create({
              data: {
                code: `TAR-${suffix}`,
                name: 'Test Receivable',
                type: 'ASSET',
                isReceivableAccount: true,
              },
            }),
            tx.chartOfAccount.create({
              data: {
                code: `TCA-${suffix}`,
                name: 'Test Cash',
                type: 'ASSET',
                systemKey: 'cash-main',
                isCashAccount: true,
              },
            }),
            tx.chartOfAccount.create({
              data: {
                code: `TRV-${suffix}`,
                name: 'Test Tuition Revenue',
                type: 'REVENUE',
                systemKey: 'tuition-revenue',
                normalBalance: 'CREDIT',
              },
            }),
            tx.chartOfAccount.create({
              data: {
                code: `TVA-${suffix}`,
                name: 'Test VAT Payable',
                type: 'LIABILITY',
                systemKey: 'vat-payable',
                normalBalance: 'CREDIT',
                isVatAccount: true,
              },
            }),
          ]);
          const registration = await tx.registration.create({
            data: {
              registrationNumber: `TEST-${suffix}`,
              branchId: branch.id,
              status: 'approved',
              studentName: 'Accounting Test Student',
              grade: 'Grade 1',
              data: {},
            },
          });
          const student = await tx.student.create({
            data: {
              registrationId: registration.id,
              registrationNumber: registration.registrationNumber,
              branchId: branch.id,
              englishName: 'Accounting Test Student',
              grade: 'Grade 1',
            },
          });
          const account = await tx.financeAccount.create({
            data: {
              registrationId: registration.id,
              studentId: student.id,
              expectedTotal: 29325,
            },
          });
          await tx.accountingCustomer.create({
            data: {
              customerCode: `TC-${suffix}`,
              studentId: student.id,
              registrationId: registration.id,
              registrationNumber: registration.registrationNumber,
              nameEn: student.englishName,
              receivableAccountId: receivable.id,
            },
          });

          const nestedClient = new Proxy(tx as unknown as PrismaClient, {
            get(target, property, receiver) {
              if (property === '$transaction') {
                return async (operation: (client: Prisma.TransactionClient) => unknown) => operation(tx);
              }
              return Reflect.get(target, property, receiver);
            },
          });
          const finance = new FinanceService(nestedClient);
          const invoice = await finance.createInvoice(
            {
              invoiceNumber: `INV-TEST-${suffix}`,
              accountId: account.id,
              amountBeforeVat: 25500,
              vat: 3825,
              total: 29325,
              feeItem: 'Tuition',
            },
            {},
          );
          await finance.createPayment(
            {
              accountId: account.id,
              invoiceId: invoice.id,
              receiptNumber: `REC-TEST-${suffix}`,
              amount: 29325,
              method: 'Cash',
            },
            {},
          );

          const balances = await tx.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: { in: [receivable.id, cash.id, revenue.id, vatPayable.id] },
              journalEntry: { status: 'POSTED', deletedAt: null },
            },
            _sum: { debit: true, credit: true },
          });
          const balance = (id: string, normal: 'debit' | 'credit') => {
            const row = balances.find((item) => item.accountId === id);
            const debit = Number(row?._sum.debit || 0);
            const credit = Number(row?._sum.credit || 0);
            return normal === 'debit' ? debit - credit : credit - debit;
          };
          observed.cash = balance(cash.id, 'debit');
          observed.receivable = balance(receivable.id, 'debit');
          observed.revenue = balance(revenue.id, 'credit');
          observed.vat = balance(vatPayable.id, 'credit');
          observed.journals = await tx.journalEntry.count({
            where: {
              sourceType: { in: ['finance_invoice', 'finance_payment'] },
              sourceId: { in: [invoice.id] },
            },
          });
          const posted = await tx.journalEntry.findMany({
            where: { OR: [{ invoiceId: invoice.id }, { payment: { allocations: { some: { invoiceId: invoice.id } } } }] },
            include: { lines: true },
          });
          observed.balanced = posted.every(
            (entry) =>
              entry.lines.reduce((sum, line) => sum + Number(line.debit), 0) ===
              entry.lines.reduce((sum, line) => sum + Number(line.credit), 0),
          )
            ? 1
            : 0;
          observed.postedCount = posted.length;
          throw new RollbackFixture();
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBeInstanceOf(RollbackFixture);

    expect(observed).toMatchObject({
      cash: 29325,
      receivable: 0,
      revenue: 25500,
      vat: 3825,
      balanced: 1,
      postedCount: 2,
    });
  }, 30_000);
});

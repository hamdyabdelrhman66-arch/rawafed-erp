import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma/client.js';
import { FinanceService } from '../src/services/finance.service.js';

class RollbackFixture extends Error {}

describe('school fee accounting behavior', () => {
  const observed: Record<string, number> = {};
  const expected = {
    cash: 29325,
    receivable: 0,
    revenue: 25500,
    vat: 3825,
    balanced: 1,
    postedCount: 3,
    activeInvoiceRejected: 1,
    cancelPaymentCash: 10000,
    cancelPaymentReceivable: 19325,
    cancelPaymentRevenue: 25500,
    cancelPaymentVat: 3825,
    cancelPaymentJournals: 1,
    invoiceAfterPaymentCancellation: 1,
    refundCash: 0,
    refundReceivable: 29325,
    refundRevenue: 25500,
    refundVat: 3825,
    refundJournals: 1,
    invoiceAfterRefund: 1,
    cancelCash: 0,
    cancelReceivable: 0,
    cancelRevenue: 0,
    cancelVat: 0,
    invoiceVoid: 1,
    invoiceVoidJournals: 1,
    automaticInvoiceCreated: 1,
    automaticPaymentRecorded: 1,
    automaticPostingCount: 2,
    automaticPostingsBalanced: 1,
  };

  beforeAll(async () => {

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
          const firstPayment = await finance.createPayment(
            {
              accountId: account.id,
              invoiceId: invoice.id,
              receiptNumber: `REC-TEST-${suffix}-A`,
              amount: 10000,
              method: 'Cash',
            },
            {},
          );
          const paymentResult = await finance.createPayment(
            {
              accountId: account.id,
              invoiceId: invoice.id,
              receiptNumber: `REC-TEST-${suffix}-B`,
              amount: 19325,
              method: 'Cash',
            },
            {},
          );

          const balances = await tx.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: { in: [receivable.id, cash.id, revenue.id, vatPayable.id] },
              journalEntry: { status: { in: ['POSTED', 'REVERSED'] }, deletedAt: null },
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
          observed.activeInvoiceRejected = await finance
            .cancelInvoice(invoice.id, {})
            .then(() => 0, () => 1);
          const cancelledPaymentJournal = await tx.journalEntry.findFirstOrThrow({
            where: { sourceType: 'finance_payment', sourceId: paymentResult.payment.id },
          });

          await finance.cancelPayment(paymentResult.payment.id, {});
          await finance.cancelPayment(paymentResult.payment.id, {});
          const afterPaymentCancellation = await tx.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: { in: [receivable.id, cash.id, revenue.id, vatPayable.id] },
              journalEntry: { status: { in: ['POSTED', 'REVERSED'] }, deletedAt: null },
            },
            _sum: { debit: true, credit: true },
          });
          const paymentCancellationBalance = (id: string, normal: 'debit' | 'credit') => {
            const row = afterPaymentCancellation.find((item) => item.accountId === id);
            const debit = Number(row?._sum.debit || 0);
            const credit = Number(row?._sum.credit || 0);
            return normal === 'debit' ? debit - credit : credit - debit;
          };
          observed.cancelPaymentCash = paymentCancellationBalance(cash.id, 'debit');
          observed.cancelPaymentReceivable = paymentCancellationBalance(receivable.id, 'debit');
          observed.cancelPaymentRevenue = paymentCancellationBalance(revenue.id, 'credit');
          observed.cancelPaymentVat = paymentCancellationBalance(vatPayable.id, 'credit');
          observed.cancelPaymentJournals = await tx.journalEntry.count({
            where: { sourceType: 'finance_payment_void', sourceId: cancelledPaymentJournal.id },
          });
          observed.invoiceAfterPaymentCancellation =
            (await tx.financeInvoice.findUnique({ where: { id: invoice.id } }))?.status === 'PARTIALLY_PAID' ? 1 : 0;

          const originalPaymentJournal = await tx.journalEntry.findFirstOrThrow({
            where: { sourceType: 'finance_payment', sourceId: firstPayment.payment.id },
          });

          await finance.refundPayment(firstPayment.payment.id, {});
          await finance.refundPayment(firstPayment.payment.id, {});
          const afterRefund = await tx.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: { in: [receivable.id, cash.id, revenue.id, vatPayable.id] },
              journalEntry: { status: { in: ['POSTED', 'REVERSED'] }, deletedAt: null },
            },
            _sum: { debit: true, credit: true },
          });
          const refundedBalance = (id: string, normal: 'debit' | 'credit') => {
            const row = afterRefund.find((item) => item.accountId === id);
            const debit = Number(row?._sum.debit || 0);
            const credit = Number(row?._sum.credit || 0);
            return normal === 'debit' ? debit - credit : credit - debit;
          };
          observed.refundCash = refundedBalance(cash.id, 'debit');
          observed.refundReceivable = refundedBalance(receivable.id, 'debit');
          observed.refundRevenue = refundedBalance(revenue.id, 'credit');
          observed.refundVat = refundedBalance(vatPayable.id, 'credit');
          observed.refundJournals = await tx.journalEntry.count({
            where: { sourceType: 'finance_payment_refund', sourceId: originalPaymentJournal.id },
          });
          observed.invoiceAfterRefund =
            (await tx.financeInvoice.findUnique({ where: { id: invoice.id } }))?.status === 'ISSUED' ? 1 : 0;

          const originalInvoiceJournal = await tx.journalEntry.findFirstOrThrow({
            where: { sourceType: 'finance_invoice', sourceId: invoice.id },
          });
          await finance.cancelInvoice(invoice.id, {});
          await finance.cancelInvoice(invoice.id, {});
          const afterCancellation = await tx.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: { in: [receivable.id, cash.id, revenue.id, vatPayable.id] },
              journalEntry: { status: { in: ['POSTED', 'REVERSED'] }, deletedAt: null },
            },
            _sum: { debit: true, credit: true },
          });
          const cancelledBalance = (id: string, normal: 'debit' | 'credit') => {
            const row = afterCancellation.find((item) => item.accountId === id);
            const debit = Number(row?._sum.debit || 0);
            const credit = Number(row?._sum.credit || 0);
            return normal === 'debit' ? debit - credit : credit - debit;
          };
          observed.cancelCash = cancelledBalance(cash.id, 'debit');
          observed.cancelReceivable = cancelledBalance(receivable.id, 'debit');
          observed.cancelRevenue = cancelledBalance(revenue.id, 'credit');
          observed.cancelVat = cancelledBalance(vatPayable.id, 'credit');
          observed.invoiceVoid =
            (await tx.financeInvoice.findUnique({ where: { id: invoice.id } }))?.status === 'VOID' ? 1 : 0;
          observed.invoiceVoidJournals = await tx.journalEntry.count({
            where: { sourceType: 'finance_invoice_void', sourceId: originalInvoiceJournal.id },
          });

          const automaticRegistration = await tx.registration.create({
            data: {
              registrationNumber: `TEST-AUTO-${suffix}`,
              branchId: branch.id,
              status: 'approved',
              studentName: 'Automatic Invoice Student',
              grade: 'KG1',
              data: {},
            },
          });
          const automaticStudent = await tx.student.create({
            data: {
              registrationId: automaticRegistration.id,
              registrationNumber: automaticRegistration.registrationNumber,
              branchId: branch.id,
              englishName: 'Automatic Invoice Student',
              grade: 'KG1',
            },
          });
          const automaticAccount = await tx.financeAccount.create({
            data: {
              registrationId: automaticRegistration.id,
              studentId: automaticStudent.id,
              expectedTotal: 5000,
              feeItems: { create: { name: 'Tuition', amount: 5000 } },
            },
          });
          await tx.accountingCustomer.create({
            data: {
              customerCode: `TC-AUTO-${suffix}`,
              studentId: automaticStudent.id,
              registrationId: automaticRegistration.id,
              registrationNumber: automaticRegistration.registrationNumber,
              nameEn: automaticStudent.englishName,
              receivableAccountId: receivable.id,
            },
          });
          const automaticResult = await finance.createPayment(
            {
              accountId: automaticAccount.id,
              receiptNumber: `REC-AUTO-${suffix}`,
              amount: 1250,
              method: 'Cash',
              paidAt: '2026-07-13',
              lines: [{ feeItem: 'Tuition', amount: 1250 }],
            },
            {},
          );
          observed.automaticInvoiceCreated =
            automaticResult.invoice.total === 5000 ? 1 : 0;
          observed.automaticPaymentRecorded =
            automaticResult.payment.amount === 1250 &&
            automaticResult.invoice.paid === 1250
              ? 1
              : 0;
          const automaticPostings = await tx.journalEntry.findMany({
            where: {
              OR: [
                { invoiceId: automaticResult.invoice.id },
                { paymentId: automaticResult.payment.id },
              ],
            },
            include: { lines: true },
          });
          observed.automaticPostingCount = automaticPostings.length;
          observed.automaticPostingsBalanced = automaticPostings.every(
            (entry) =>
              entry.lines.reduce((sum, line) => sum + Number(line.debit), 0) ===
              entry.lines.reduce((sum, line) => sum + Number(line.credit), 0),
          )
            ? 1
            : 0;
          throw new RollbackFixture();
        },
        { timeout: 120_000 },
      ),
    ).rejects.toBeInstanceOf(RollbackFixture);

  }, 120_000);

  it.each(Object.entries(expected))('%s matches the authoritative ledger', (key, value) => {
    expect(observed[key]).toBe(value);
  });
});

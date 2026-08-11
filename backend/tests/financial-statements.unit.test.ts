import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { FinancialStatementsService } from '../src/services/financial-statements.service';

describe('posted journal financial statements', () => {
  it('returns period rows, inclusive date boundaries, and a reconciled running balance', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 'line-1', journalEntryId: 'journal-1', debit: 200, credit: 0, description: 'Period movement', createdAt: new Date('2026-08-10T12:00:00Z'),
      journalEntry: { entryNumber: 'JE-1', postingDate: new Date('2026-08-10T12:00:00Z'), referenceNumber: 'REF-1', description: 'Posted movement' },
    }]);
    const groupBy = vi.fn().mockResolvedValue([{ accountId: 'cash', _sum: { debit: 25, credit: 0 } }]);
    const prisma = {
      chartOfAccount: { findFirst: vi.fn().mockResolvedValue({
        id: 'cash', openingBalance: 100, openingDate: new Date('2026-01-01T00:00:00Z'), normalBalance: 'DEBIT',
      }) },
      journalLine: { findMany, groupBy },
    } as unknown as PrismaClient;

    const ledger = await new FinancialStatementsService(prisma).ledger('cash', '2026-08-10', '2026-08-10');
    const where = findMany.mock.calls[0][0].where.journalEntry.postingDate;
    expect(where.gte.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    expect(where.lte.toISOString()).toBe('2026-08-10T23:59:59.999Z');
    expect(ledger).toMatchObject({ openingBalance: 125, periodDebit: 200, periodCredit: 0, closingBalance: 325 });
    expect(ledger.transactions[0]).toMatchObject({ balance: 325, runningBalance: 325, entryNumber: 'JE-1' });
    expect(ledger.openingBalance + ledger.periodDebit - ledger.periodCredit).toBe(ledger.closingBalance);
  });

  it('reports equal aggregate period debits and credits for balanced posted journals', async () => {
    const groupBy = vi.fn()
      .mockResolvedValueOnce([
        { accountId: 'cash', _sum: { debit: 500, credit: 0 } },
        { accountId: 'revenue', _sum: { debit: 0, credit: 500 } },
      ])
      .mockResolvedValueOnce([]);
    const accounts = [
      { id: 'cash', code: '1100', name: 'Cash', nameAr: 'النقدية', type: 'ASSET', parentId: null, openingBalance: 0, openingDate: null, normalBalance: 'DEBIT' },
      { id: 'revenue', code: '4100', name: 'Revenue', nameAr: 'الإيرادات', type: 'REVENUE', parentId: null, openingBalance: 0, openingDate: null, normalBalance: 'CREDIT' },
    ];
    const prisma = {
      chartOfAccount: { findMany: vi.fn().mockResolvedValue(accounts) },
      journalLine: { groupBy },
    } as unknown as PrismaClient;
    const report = await new FinancialStatementsService(prisma).trialBalance({
      fromDate: '2026-08-01', toDate: '2026-08-31', displayMode: 'all',
    });
    expect(report.totals.periodDebit).toBe(500);
    expect(report.totals.periodCredit).toBe(500);
    expect(report.balanced).toBe(true);
  });
});

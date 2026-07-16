import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma/client.js';
import { JournalService } from '../src/services/journal.service.js';

class RollbackFixture extends Error {}

describe('professional journal correction workflow', () => {
  it('keeps posted lines immutable and links original, reversal and corrected draft', async () => {
    const transaction = prisma.$transaction(async (tx) => {
      const suffix = randomUUID().slice(0, 8);
      const branch = await tx.branch.findFirstOrThrow({ where: { active: true, deletedAt: null } });
      const role = await tx.role.findUniqueOrThrow({ where: { name: 'Super Admin' } });
      const maker = await tx.user.create({ data: { username: `journal-maker-${suffix}`, displayName: 'Journal Maker', passwordHash: 'test-only-hash', roleId: role.id } });
      const approver = await tx.user.create({ data: { username: `journal-approver-${suffix}`, displayName: 'Journal Approver', passwordHash: 'test-only-hash', roleId: role.id } });
      const debitAccount = await tx.chartOfAccount.create({ data: { code: `JD-${suffix}`, name: 'Journal debit test', nameAr: 'حساب مدين اختباري', type: 'ASSET', allowPosting: true, allowManualJournal: true } });
      const creditAccount = await tx.chartOfAccount.create({ data: { code: `JC-${suffix}`, name: 'Journal credit test', nameAr: 'حساب دائن اختباري', type: 'EQUITY', normalBalance: 'CREDIT', allowPosting: true, allowManualJournal: true } });
      const nestedClient = new Proxy(tx as unknown as PrismaClient, { get(target, property, receiver) { if (property === '$transaction') return async (operation: (client: Prisma.TransactionClient) => unknown) => operation(tx); return Reflect.get(target, property, receiver); } });
      const service = new JournalService(nestedClient);
      const draft = await service.post({ postingDate: new Date(), description: 'Original manual draft', sourceType: 'manual_journal', sourceId: randomUUID(), status: 'DRAFT', lines: [{ accountId: debitAccount.id, debit: 100 }, { accountId: creditAccount.id, credit: 100 }] }, { id: maker.id, role: 'Super Admin' });
      const edited = await service.updateManual(draft.id, { postingDate: new Date(), description: 'Edited before posting', sourceType: 'manual_journal', sourceId: draft.sourceId, status: 'DRAFT', lines: [{ accountId: debitAccount.id, debit: 125 }, { accountId: creditAccount.id, credit: 125 }] }, { id: maker.id, role: 'Super Admin' });
      expect(edited.status).toBe('DRAFT');
      await service.transition(draft.id, 'submit', { id: maker.id, role: 'Super Admin' });
      await service.transition(draft.id, 'approve', { id: approver.id, role: 'Super Admin' });
      const posted = await service.transition(draft.id, 'post', { id: approver.id, role: 'Super Admin' });
      const originalLines = posted.lines.map((line: any) => ({ accountId: line.accountId, debit: line.debit, credit: line.credit }));
      await expect(service.updateManual(draft.id, { postingDate: new Date(), description: 'Forbidden overwrite', sourceType: 'manual_journal', sourceId: draft.sourceId, lines: [{ accountId: debitAccount.id, debit: 1 }, { accountId: creditAccount.id, credit: 1 }] }, { id: maker.id, role: 'Super Admin' })).rejects.toMatchObject({ code: 'POSTED_JOURNAL_IMMUTABLE' });
      const result = await service.correctPosted(draft.id, undefined, 'Correcting account allocation after review', false, { id: approver.id, role: 'Super Admin' });
      const original = await tx.journalEntry.findUniqueOrThrow({ where: { id: draft.id }, include: { lines: true, reversal: true, corrections: true } });
      expect(original.status).toBe('REVERSED');
      expect(original.lines.map((line) => ({ accountId: line.accountId, debit: Number(line.debit), credit: Number(line.credit) }))).toEqual(originalLines);
      expect(original.reversal?.id).toBe(result.reversal.id);
      expect(original.corrections[0]?.id).toBe(result.corrected.id);
      expect(result.corrected.status).toBe('DRAFT');
      expect(result.corrected.correctionReason).toBe('Correcting account allocation after review');
      const postedBalance = await tx.journalLine.aggregate({ where: { accountId: debitAccount.id, journalEntry: { status: { in: ['POSTED', 'REVERSED'] } } }, _sum: { debit: true, credit: true } });
      expect(Number(postedBalance._sum.debit || 0) - Number(postedBalance._sum.credit || 0)).toBe(0);
      expect(branch.id).toBeTruthy();
      throw new RollbackFixture();
    }, { maxWait: 20_000, timeout: 120_000 }).catch((error) => { if (!(error instanceof RollbackFixture)) console.error(error); throw error; });
    await expect(transaction).rejects.toBeInstanceOf(RollbackFixture);
  });
});

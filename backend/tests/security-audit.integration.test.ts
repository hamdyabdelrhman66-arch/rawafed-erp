import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma/client.js';
import { AuditRepository } from '../src/repositories/audit.repository.js';

class RollbackFixture extends Error {}

describe('immutable security audit', () => {
  it('masks sensitive values and stores a chained record hash', async () => {
    await expect(prisma.$transaction(async (tx) => {
      const row = await new AuditRepository(tx).create({ action: 'security audit test', entityType: 'test', entityId: randomUUID(), oldValues: { nationalId: '1234567890', password: 'NeverStoreThis' }, newValues: { phone: '+966500000000', accessToken: 'NeverStoreToken' } });
      expect(row.recordHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(row.oldValues)).not.toContain('NeverStoreThis');
      expect(JSON.stringify(row.newValues)).not.toContain('NeverStoreToken');
      expect(JSON.stringify(row.oldValues)).not.toContain('1234567890');
      throw new RollbackFixture();
    }, { maxWait: 10_000, timeout: 30_000 })).rejects.toBeInstanceOf(RollbackFixture);
  });

  it('rejects database updates to audit rows', async () => {
    await expect(prisma.$transaction(async (tx) => {
      const row = await tx.auditLog.create({ data: { action: 'immutability test', entityType: 'test', recordHash: randomUUID() } });
      await tx.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } });
    }, { maxWait: 10_000, timeout: 30_000 })).rejects.toThrow(/append-only/i);
  });
});

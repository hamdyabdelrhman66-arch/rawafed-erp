import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRegistration } from '../../src/app/core/models/admission.models';
import { StorageService } from '../../src/app/core/services/storage.service';
import type { ApiService } from '../../src/app/core/api/api.service';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

describe('registration local draft lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.stubGlobal('window', { addEventListener: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  const service = () => new StorageService({} as ApiService);

  it('restores only the active unfinished draft in the same tab context', () => {
    const registration = createEmptyRegistration();
    registration.student.englishName = 'Active Draft Student';
    service().saveDraft(registration);
    expect(service().getDraft()?.student.englishName).toBe('Active Draft Student');
  });

  it('does not carry an unfinished draft into an unrelated new tab context', () => {
    const registration = createEmptyRegistration();
    registration.student.englishName = 'First Tab Student';
    service().saveDraft(registration);
    sessionStorage.clear();
    expect(service().getDraft()).toBeNull();
  });

  it('clears completed registration data instead of treating it as a draft', () => {
    const registration = createEmptyRegistration();
    registration.status = 'pending';
    registration.registrationNumber = 'RAW-2026-999999';
    service().saveDraft(registration);
    expect(service().getDraft()).toBeNull();
  });

  it('discards a completed legacy draft during migration', () => {
    const registration = createEmptyRegistration();
    registration.status = 'approved';
    registration.registrationNumber = 'RAW-2026-000001';
    localStorage.setItem('rawafed.currentDraft', JSON.stringify(registration));
    expect(service().getDraft()).toBeNull();
    expect(localStorage.getItem('rawafed.currentDraft')).toBeNull();
  });
});

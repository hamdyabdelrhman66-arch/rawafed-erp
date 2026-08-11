import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/app/core/auth/auth.service';
import type { ApiService } from '../../src/app/core/api/api.service';
import type { Router } from '@angular/router';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

describe('authenticated tab session restoration', () => {
  const listeners = new Map<string, EventListener>();
  const api = { setToken: vi.fn(), clearToken: vi.fn() } as unknown as ApiService;
  const router = { navigate: vi.fn() } as unknown as Router;

  beforeEach(() => {
    listeners.clear(); vi.clearAllMocks();
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.stubGlobal('window', {
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores the shared session synchronously for a deep-linked new tab', () => {
    localStorage.setItem('rawafed_auth', JSON.stringify({
      id: 'u1', username: 'finance', displayName: 'Finance', role: 'Finance', token: 'access', refreshToken: 'refresh',
    }));
    const auth = new AuthService(router, api);
    expect(auth.session()?.username).toBe('finance');
    expect(api.setToken).toHaveBeenCalledWith('access');
  });

  it('synchronizes logout from another tab through the storage event', () => {
    localStorage.setItem('rawafed_auth', JSON.stringify({
      id: 'u1', username: 'finance', displayName: 'Finance', role: 'Finance', token: 'access', refreshToken: 'refresh',
    }));
    const auth = new AuthService(router, api);
    localStorage.removeItem('rawafed_auth');
    listeners.get('storage')?.({ key: 'rawafed_auth' } as StorageEvent);
    expect(auth.session()).toBeNull();
    expect(api.clearToken).toHaveBeenCalled();
  });
});

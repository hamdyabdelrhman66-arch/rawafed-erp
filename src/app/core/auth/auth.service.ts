import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../api/api.service';
import { AuthSession, UserRole } from './auth.models';

const AUTH_KEY = 'rawafed_auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<AuthSession | null>(this.readSession());

  constructor(
    private readonly router: Router,
    private readonly api: ApiService
  ) {
    const current = this.session();
    if (current?.token) this.api.setToken(current.token);
    window.addEventListener('rawafed-session-expired', () => {
      this.session.set(null);
      void this.router.navigate(['/login'], { queryParams: { reason: 'session-expired' } });
    });
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await this.api.post<{ token: string; refreshToken: string; user: AuthSession }>('/auth/login', { username, password });
      const session: AuthSession = {
        id: response.user.id,
        username: response.user.username,
        displayName: response.user.displayName,
        role: response.user.role,
        token: response.token,
        refreshToken: response.refreshToken
      };
      this.api.setToken(response.token);
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
      this.session.set(session);
      return true;
    } catch {
      return false;
    }
  }

  logout(): void {
    const refreshToken = this.session()?.refreshToken;
    if (refreshToken) void this.api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    this.api.clearToken();
    sessionStorage.removeItem(AUTH_KEY);
    this.session.set(null);
    this.router.navigate(['/login']);
  }

  canAccess(allowedRoles?: UserRole[]): boolean {
    const current = this.session();
    if (!current) return false;
    return current.role === 'Super Admin' || !allowedRoles?.length || allowedRoles.includes(current.role);
  }

  homeForRole(role: UserRole): string {
    if (['Finance', 'Finance Manager', 'Chief Accountant', 'Accountant', 'Auditor'].includes(role)) return '/finance';
    if (role === 'Registrar') return '/applications';
    if (role === 'Principal') return '/admin';
    return '/admin';
  }

  private readSession(): AuthSession | null {
    try {
      const raw = sessionStorage.getItem(AUTH_KEY);
      const session = raw ? (JSON.parse(raw) as AuthSession) : null;
      if (session?.token === 'demo-vercel-session') {
        sessionStorage.removeItem(AUTH_KEY);
        sessionStorage.removeItem('rawafed_api_token');
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }
}

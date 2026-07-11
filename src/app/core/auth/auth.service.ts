import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../api/api.service';
import { AuthSession, AuthUser, UserRole } from './auth.models';

const AUTH_KEY = 'rawafed_auth';

export const DEMO_USERS: AuthUser[] = [
  { username: 'admin', password: 'admin123', displayName: 'Super Admin', role: 'Super Admin' },
  { username: 'admissions', password: 'admit123', displayName: 'Admissions Officer', role: 'Admissions' },
  { username: 'finance', password: 'finance123', displayName: 'Finance Officer', role: 'Finance' },
  { username: 'finmanager', password: 'finance123', displayName: 'Finance Manager', role: 'Finance Manager' },
  { username: 'chiefaccountant', password: 'account123', displayName: 'Chief Accountant', role: 'Chief Accountant' },
  { username: 'accountant', password: 'account123', displayName: 'Accountant', role: 'Accountant' },
  { username: 'auditor', password: 'auditor123', displayName: 'Auditor', role: 'Auditor' },
  { username: 'principal', password: 'principal123', displayName: 'Principal', role: 'Principal' },
  { username: 'registrar', password: 'registrar123', displayName: 'Registrar', role: 'Registrar' }
];

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<AuthSession | null>(this.readSession());

  constructor(
    private readonly router: Router,
    private readonly api: ApiService
  ) {}

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await this.api.post<{ token: string; refreshToken: string; user: AuthSession }>('/auth/login', { username, password });
      const session: AuthSession = {
        username: response.user.username,
        displayName: response.user.displayName,
        role: response.user.role,
        token: response.token,
        refreshToken: response.refreshToken
      };
      this.api.setToken(response.token);
      localStorage.setItem(AUTH_KEY, JSON.stringify(session));
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
    localStorage.removeItem(AUTH_KEY);
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
      const raw = localStorage.getItem(AUTH_KEY);
      const session = raw ? (JSON.parse(raw) as AuthSession) : null;
      if (session?.token === 'demo-vercel-session') {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem('rawafed_api_token');
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }
}

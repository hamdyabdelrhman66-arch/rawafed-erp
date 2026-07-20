import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, firstValueFrom, from, Observable, switchMap, throwError } from 'rxjs';
import { ApiSafeError } from '../feedback/http-error.interceptor';

const TOKEN_KEY = 'rawafed_api_token';
const API_OVERRIDE_KEY = 'rawafed_api_base_url';

declare global {
  interface Window {
    RAWAFED_API_BASE_URL?: string;
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private refreshPromise?: Promise<string>;

  constructor(private readonly http: HttpClient) {}

  get token(): string {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) return token;
    try {
      const session = JSON.parse(sessionStorage.getItem('rawafed_auth') || 'null');
      return session?.token || '';
    } catch {
      return '';
    }
  }

  setToken(token: string): void {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  clearToken(): void {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  get<T>(path: string): Promise<T> {
    return this.request(() => this.http.get<T>(this.url(path), { headers: this.headers() }));
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request(() => this.http.post<T>(this.url(path), body, { headers: this.headers() }), path === '/auth/refresh');
  }

  postForm<T>(path: string, body: FormData): Promise<T> {
    return this.request(() => this.http.post<T>(this.url(path), body, { headers: this.headers() }));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request(() => this.http.patch<T>(this.url(path), body, { headers: this.headers() }));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request(() => this.http.put<T>(this.url(path), body, { headers: this.headers() }));
  }

  delete<T>(path: string): Promise<T> {
    return this.request(() => this.http.delete<T>(this.url(path), { headers: this.headers() }));
  }

  private request<T>(factory: () => Observable<T>, skipRefresh = false): Promise<T> {
    return firstValueFrom(factory().pipe(
      catchError((error: unknown) => {
        if (!skipRefresh && this.isUnauthorized(error) && this.readRefreshToken()) {
          return from(this.refreshAccessToken()).pipe(switchMap(() => factory()));
        }
        return this.handleError(error);
      }),
      catchError((error: unknown) => this.handleError(error)),
    ));
  }

  private isUnauthorized(error: unknown): boolean {
    return (error instanceof ApiSafeError || error instanceof HttpErrorResponse) && error.status === 401;
  }

  private readRefreshToken(): string {
    try { return JSON.parse(sessionStorage.getItem('rawafed_auth') || 'null')?.refreshToken || ''; }
    catch { return ''; }
  }

  private refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise;
    const refreshToken = this.readRefreshToken();
    this.refreshPromise = firstValueFrom(this.http.post<{ token: string; refreshToken?: string }>(
      this.url('/auth/refresh'),
      { refreshToken },
      { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) },
    )).then((response) => {
      const session = JSON.parse(sessionStorage.getItem('rawafed_auth') || 'null');
      if (!session || !response.token) throw new Error('Session refresh did not return an access token.');
      session.token = response.token;
      if (response.refreshToken) session.refreshToken = response.refreshToken;
      sessionStorage.setItem('rawafed_auth', JSON.stringify(session));
      this.setToken(response.token);
      return response.token;
    }).catch((error) => {
      this.clearSession();
      throw error;
    }).finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }

  private clearSession(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('rawafed_auth');
    window.dispatchEvent(new Event('rawafed-session-expired'));
  }

  private url(path: string): string {
    return `${this.apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private headers(): HttpHeaders {
    return this.token ? new HttpHeaders({ Authorization: `Bearer ${this.token}` }) : new HttpHeaders();
  }

  private handleError(error: unknown) {
    if (error instanceof ApiSafeError) {
      if (error.status === 401) {
        this.clearSession();
      }
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        this.clearSession();
      }
      const message = error.error?.safeMessage || error.error?.message || error.message || 'Could not reach backend.';
      return throwError(() => new Error(`${message} (${error.status})`));
    }
    return throwError(() => error);
  }

  private apiBaseUrl(): string {
    const override = localStorage.getItem(API_OVERRIDE_KEY) || window.RAWAFED_API_BASE_URL || '';
    if (override.trim()) return override.replace(/\/$/, '');

    const hostedBackend = 'https://rawafed-erp-backend.onrender.com/api';
    const localHosts = new Set(['127.0.0.1', 'localhost']);
    if (localHosts.has(window.location.hostname)) return 'http://127.0.0.1:4300/api';

    return hostedBackend;
  }
}

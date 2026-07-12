import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, firstValueFrom, throwError } from 'rxjs';
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
  constructor(private readonly http: HttpClient) {}

  get token(): string {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;
    try {
      const session = JSON.parse(localStorage.getItem('rawafed_auth') || 'null');
      return session?.token || '';
    } catch {
      return '';
    }
  }

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(path), { headers: this.headers() }).pipe(catchError((error) => this.handleError(error))));
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body, { headers: this.headers() }).pipe(catchError((error) => this.handleError(error))));
  }

  postForm<T>(path: string, body: FormData): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body, { headers: this.headers() }).pipe(catchError((error) => this.handleError(error))));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.url(path), body, { headers: this.headers() }).pipe(catchError((error) => this.handleError(error))));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.url(path), body, { headers: this.headers() }).pipe(catchError((error) => this.handleError(error))));
  }

  delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.url(path), { headers: this.headers() }).pipe(catchError((error) => this.handleError(error))));
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
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('rawafed_auth');
      }
      return throwError(() => error);
    }
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('rawafed_auth');
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

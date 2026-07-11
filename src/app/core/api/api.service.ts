import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(path), { headers: this.headers() }));
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body, { headers: this.headers() }));
  }

  postForm<T>(path: string, body: FormData): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body, { headers: this.headers() }));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.url(path), body, { headers: this.headers() }));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.url(path), body, { headers: this.headers() }));
  }

  delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.url(path), { headers: this.headers() }));
  }

  private url(path: string): string {
    return `${this.apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private headers(): HttpHeaders {
    return this.token ? new HttpHeaders({ Authorization: `Bearer ${this.token}` }) : new HttpHeaders();
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

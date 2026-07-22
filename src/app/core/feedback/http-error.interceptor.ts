import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, retry, throwError, timer } from 'rxjs';
import { FeedbackService } from './feedback.service';
import { I18nService } from '../i18n/i18n.service';

export class ApiSafeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode = 'REQUEST_FAILED',
    readonly requestId = ''
  ) {
    super(message);
  }
}

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const feedback = inject(FeedbackService);
  const i18n = inject(I18nService);
  return next(req).pipe(
    retry({
      count: 4,
      delay: (error: unknown, retryCount: number) => isSafeTransientRead(req.method, error)
        ? timer(Math.min(750 * (2 ** (retryCount - 1)), 6000))
        : throwError(() => error),
    }),
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);

      const mapped = mapHttpError(error, i18n);
      if (shouldShowHttpError(req.url, error.status)) {
        feedback.error(mapped.message, mapped.requestId ? `Request ID: ${mapped.requestId}` : '');
      }
      return throwError(() => new ApiSafeError(mapped.message, error.status, mapped.errorCode, mapped.requestId));
    })
  );
};

function mapHttpError(error: HttpErrorResponse, i18n: I18nService): { message: string; errorCode: string; requestId: string } {
  const body = error.error || {};
  const safeMessage = body.safeMessage || body.message;
  const requestId = body.requestId || error.headers?.get?.('x-request-id') || '';
  const errorCode = body.errorCode || statusCodeToErrorCode(error.status);

  const translatedKey = `error.${String(errorCode).toLowerCase()}`;
  const translated = i18n.t(translatedKey);
  if (translated !== translatedKey) return { message: translated, errorCode, requestId };
  if (i18n.language() === 'ar') {
    const genericKey = error.status === 401 ? 'error.session_expired'
      : error.status === 403 ? 'error.permission_denied'
      : error.status === 404 ? 'error.not_found'
      : [400, 409, 422].includes(error.status) ? 'error.validation_error'
      : error.status === 504 ? 'error.request_timeout'
      : [0, 502, 503].includes(error.status) ? 'error.service_unavailable'
      : 'error.server_error';
    return { message: i18n.t(genericKey), errorCode, requestId };
  }
  if (safeMessage) return { message: safeMessage, errorCode, requestId };

  const messageByStatus: Record<number, string> = {
    0: 'The server is unavailable. Please check the connection and try again.',
    400: 'Please complete the required fields.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested record was not found.',
    409: 'This record already exists or was modified by another user.',
    422: 'This action cannot be completed because a business rule was not met.',
    429: 'Too many requests. Please wait and try again.',
    500: 'The server could not complete the request. Please try again.',
    502: 'The service is starting. Please wait and try again.',
    503: 'The service is temporarily unavailable. Please try again.',
    504: 'The request took too long. Please try again.'
  };

  return {
    message: messageByStatus[error.status] || 'The action could not be completed. Please try again.',
    errorCode,
    requestId
  };
}

function isSafeTransientRead(method: string, error: unknown): boolean {
  if (!['GET', 'HEAD'].includes(method.toUpperCase()) || !(error instanceof HttpErrorResponse)) return false;
  const code = String(error.error?.errorCode || '');
  return [0, 502, 503, 504].includes(error.status)
    || ['DATABASE_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'TRANSACTION_TIMEOUT'].includes(code);
}

function shouldShowHttpError(url: string, status: number): boolean {
  if (status === 401) return false;
  if ([400, 404, 409, 422].includes(status)) return false;
  if (url.includes('/auth/login')) return false;
  if (isPublicShellPage()) return false;
  return true;
}

function isPublicShellPage(): boolean {
  return ['/', '/login', '/register'].includes(window.location.pathname);
}

function statusCodeToErrorCode(status: number): string {
  const map: Record<number, string> = {
    400: 'VALIDATION_ERROR',
    401: 'SESSION_EXPIRED',
    403: 'PERMISSION_DENIED',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'BUSINESS_RULE_FAILED',
    429: 'RATE_LIMITED',
    500: 'SERVER_ERROR',
    502: 'SERVICE_UNAVAILABLE',
    503: 'SERVICE_UNAVAILABLE',
    504: 'TRANSACTION_TIMEOUT'
  };
  return map[status] || 'REQUEST_FAILED';
}

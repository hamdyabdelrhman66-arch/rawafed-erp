import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { FeedbackService } from './feedback.service';

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
  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);

      const mapped = mapHttpError(error);
      if (!req.url.includes('/auth/login')) {
        feedback.error(mapped.message, mapped.requestId ? `Request ID: ${mapped.requestId}` : '');
      }
      return throwError(() => new ApiSafeError(mapped.message, error.status, mapped.errorCode, mapped.requestId));
    })
  );
};

function mapHttpError(error: HttpErrorResponse): { message: string; errorCode: string; requestId: string } {
  const body = error.error || {};
  const safeMessage = body.safeMessage || body.message;
  const requestId = body.requestId || error.headers?.get?.('x-request-id') || '';
  const errorCode = body.errorCode || statusCodeToErrorCode(error.status);

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
    503: 'The service is temporarily unavailable. Please try again.'
  };

  return {
    message: messageByStatus[error.status] || 'The action could not be completed. Please try again.',
    errorCode,
    requestId
  };
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
    503: 'SERVICE_UNAVAILABLE'
  };
  return map[status] || 'REQUEST_FAILED';
}

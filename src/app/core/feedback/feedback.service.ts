import { Injectable, computed, signal } from '@angular/core';

export type FeedbackType = 'success' | 'error' | 'warning' | 'info';

export interface FeedbackToast {
  id: string;
  type: FeedbackType;
  title: string;
  message: string;
  actionLabel?: string;
  action?: () => void;
  persistent?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary' | 'warning';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly toastList = signal<FeedbackToast[]>([]);
  private readonly pendingKeys = signal<Record<string, number>>({});
  private readonly confirmDialog = signal<ConfirmState | null>(null);

  readonly toasts = this.toastList.asReadonly();
  readonly confirmation = this.confirmDialog.asReadonly();
  readonly hasPending = computed(() => Object.keys(this.pendingKeys()).length > 0);

  success(title: string, message = '', action?: Pick<FeedbackToast, 'actionLabel' | 'action'>): void {
    this.show({ type: 'success', title, message, ...action }, 4500);
  }

  error(title: string, message = '', action?: Pick<FeedbackToast, 'actionLabel' | 'action'>): void {
    this.show({ type: 'error', title, message, persistent: true, ...action }, 12000);
  }

  warning(title: string, message = '', action?: Pick<FeedbackToast, 'actionLabel' | 'action'>): void {
    this.show({ type: 'warning', title, message, ...action }, 7000);
  }

  info(title: string, message = '', action?: Pick<FeedbackToast, 'actionLabel' | 'action'>): void {
    this.show({ type: 'info', title, message, ...action }, 5000);
  }

  validation(message: string, title = 'Please review the form'): void {
    this.warning(title, message);
  }

  close(id: string): void {
    this.toastList.update((items) => items.filter((item) => item.id !== id));
  }

  isPending(key: string): boolean {
    return Boolean(this.pendingKeys()[key]);
  }

  begin(key: string): void {
    this.pendingKeys.update((items) => ({ ...items, [key]: (items[key] || 0) + 1 }));
  }

  end(key: string): void {
    this.pendingKeys.update((items) => {
      const next = { ...items };
      const count = (next[key] || 1) - 1;
      if (count > 0) next[key] = count;
      else delete next[key];
      return next;
    });
  }

  async action<T>(key: string, work: () => Promise<T>, messages: {
    loading?: string;
    success?: string | ((result: T) => string);
    error?: string;
  } = {}): Promise<T | null> {
    if (this.isPending(key)) return null;
    this.begin(key);
    if (messages.loading) this.info(messages.loading);
    try {
      const result = await work();
      const successMessage = typeof messages.success === 'function' ? messages.success(result) : messages.success;
      if (successMessage) this.success(successMessage);
      return result;
    } catch (error) {
      this.error(messages.error || safeErrorMessage(error));
      return null;
    } finally {
      this.end(key);
    }
  }

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmDialog.set({
        cancelText: 'Cancel',
        confirmText: 'Confirm',
        tone: 'primary',
        ...options,
        resolve
      });
    });
  }

  resolveConfirmation(confirmed: boolean): void {
    const dialog = this.confirmDialog();
    if (!dialog) return;
    this.confirmDialog.set(null);
    dialog.resolve(confirmed);
  }

  private show(toast: Omit<FeedbackToast, 'id'>, duration: number): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: FeedbackToast = { id, ...toast };
    this.toastList.update((items) => [item, ...items].slice(0, 5));
    if (!item.persistent) window.setTimeout(() => this.close(id), duration);
  }
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'The action could not be completed. Please try again.';
}

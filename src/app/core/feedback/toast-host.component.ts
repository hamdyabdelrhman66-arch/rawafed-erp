import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FeedbackService, FeedbackToast } from './feedback.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <section class="toast-region" aria-live="polite" aria-relevant="additions">
      <article *ngFor="let toast of feedback.toasts()" class="toast" [class]="toast.type" role="status">
        <mat-icon aria-hidden="true">{{ icon(toast.type) }}</mat-icon>
        <div>
          <strong>{{ toast.title }}</strong>
          <p *ngIf="toast.message">{{ toast.message }}</p>
          <button *ngIf="toast.actionLabel && toast.action" type="button" class="toast-action" (click)="runAction(toast)">
            {{ toast.actionLabel }}
          </button>
        </div>
        <button type="button" class="toast-close" aria-label="Close notification" (click)="feedback.close(toast.id)">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </article>
    </section>
  `,
  styles: [`
    .toast-region {
      position: fixed;
      z-index: 10000;
      inset: 18px 18px auto auto;
      display: grid;
      gap: 10px;
      width: min(420px, calc(100vw - 36px));
      pointer-events: none;
    }
    :host-context([dir="rtl"]) .toast-region { inset: 18px auto auto 18px; }
    .toast {
      pointer-events: auto;
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr) 30px;
      gap: 10px;
      align-items: start;
      border: 1px solid #dbe3ef;
      border-radius: 14px;
      padding: 13px 12px;
      background: #fff;
      color: #0f172a;
      box-shadow: 0 18px 46px rgba(15, 23, 42, .16);
    }
    .toast.success { border-color: #bbf7d0; background: #f0fdf4; }
    .toast.error { border-color: #fecaca; background: #fff1f2; }
    .toast.warning { border-color: #fde68a; background: #fffbeb; }
    .toast.info { border-color: #bfdbfe; background: #eff6ff; }
    .toast mat-icon { color: #1e2560; }
    .toast.success mat-icon { color: #15803d; }
    .toast.error mat-icon { color: #dc2626; }
    .toast.warning mat-icon { color: #b45309; }
    strong { display: block; font-weight: 900; line-height: 1.25; }
    p { margin: 3px 0 0; color: #475569; font-weight: 650; line-height: 1.35; }
    .toast-close, .toast-action {
      border: 0;
      background: transparent;
      color: #1d4ed8;
      cursor: pointer;
      font-weight: 850;
    }
    .toast-close {
      width: 28px;
      height: 28px;
      display: inline-grid;
      place-items: center;
      color: #64748b;
    }
    .toast-close mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .toast-action { padding: 6px 0 0; }
    :host-context(.dark-mode) .toast {
      border-color: rgba(148, 163, 184, .35);
      background: #111827;
      color: #f8fafc;
    }
    :host-context(.dark-mode) p { color: #cbd5e1; }
  `]
})
export class ToastHostComponent {
  readonly feedback = inject(FeedbackService);

  icon(type: FeedbackToast['type']): string {
    return type === 'success' ? 'check_circle' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
  }

  runAction(toast: FeedbackToast): void {
    toast.action?.();
    this.feedback.close(toast.id);
  }
}

import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FeedbackService } from './feedback.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="confirm-backdrop" *ngIf="feedback.confirmation() as dialog" role="presentation">
      <section class="confirm-dialog" role="dialog" aria-modal="true" [attr.aria-label]="dialog.title">
        <div class="confirm-icon" [class]="dialog.tone">
          <mat-icon>{{ dialog.tone === 'danger' ? 'delete' : dialog.tone === 'warning' ? 'warning' : 'help' }}</mat-icon>
        </div>
        <div>
          <h2>{{ dialog.title }}</h2>
          <p>{{ dialog.message }}</p>
        </div>
        <footer>
          <button type="button" class="cancel" (click)="feedback.resolveConfirmation(false)">{{ dialog.cancelText }}</button>
          <button type="button" class="confirm" [class]="dialog.tone" (click)="feedback.resolveConfirmation(true)">
            {{ dialog.confirmText }}
          </button>
        </footer>
      </section>
    </div>
  `,
  styles: [`
    .confirm-backdrop {
      position: fixed;
      z-index: 10001;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(15, 23, 42, .42);
      backdrop-filter: blur(3px);
    }
    .confirm-dialog {
      width: min(470px, 100%);
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr);
      gap: 14px;
      border-radius: 18px;
      padding: 20px;
      background: #fff;
      color: #0f172a;
      box-shadow: 0 30px 80px rgba(15, 23, 42, .28);
    }
    .confirm-icon {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      background: #eff6ff;
      color: #1d4ed8;
    }
    .confirm-icon.danger { background: #fee2e2; color: #dc2626; }
    .confirm-icon.warning { background: #fef3c7; color: #b45309; }
    h2 { margin: 0; font-size: 1.25rem; }
    p { margin: 6px 0 0; color: #475569; line-height: 1.5; font-weight: 650; }
    footer {
      grid-column: 1 / -1;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 8px;
    }
    button {
      min-height: 42px;
      border-radius: 11px;
      padding: 0 17px;
      font-weight: 900;
      cursor: pointer;
    }
    .cancel { border: 1px solid #cbd5e1; background: #fff; color: #334155; }
    .confirm { border: 0; background: #1e2560; color: #fff; }
    .confirm.danger { background: #dc2626; }
    .confirm.warning { background: #b45309; }
    :host-context(.dark-mode) .confirm-dialog { background: #111827; color: #f8fafc; }
    :host-context(.dark-mode) p { color: #cbd5e1; }
    :host-context(.dark-mode) .cancel { background: #0f172a; color: #e2e8f0; border-color: #334155; }
  `]
})
export class ConfirmDialogComponent {
  readonly feedback = inject(FeedbackService);
}

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="search-select" [class.open]="open" (click)="$event.stopPropagation()">
      <button type="button" class="search-select-trigger" (click)="toggle()" [disabled]="disabled">
        <span>{{ selectedLabel || placeholder }}</span>
        <b>⌄</b>
      </button>

      <div class="search-select-panel" *ngIf="open">
        <input
          type="search"
          [(ngModel)]="query"
          [placeholder]="searchPlaceholder"
          (click)="$event.stopPropagation()"
          autocomplete="off" />
        <button type="button" class="search-select-option muted" *ngIf="nullable" (click)="choose(null)">
          {{ placeholder }}
        </button>
        <button
          type="button"
          class="search-select-option"
          *ngFor="let option of filteredOptions"
          [class.selected]="isSelected(option)"
          (click)="choose(option)">
          {{ optionLabel(option) }}
        </button>
        <p *ngIf="!filteredOptions.length">{{ emptyText }}</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; min-width: 0; }
    .search-select { position: relative; width: 100%; min-width: 0; }
    .search-select-trigger {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #fff;
      color: #0f172a;
      padding: 0 14px;
      font: inherit;
      font-weight: 750;
      cursor: pointer;
      text-align: start;
    }
    .search-select-trigger span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .search-select-trigger b { color: #475569; font-size: 16px; }
    .search-select-panel {
      position: absolute;
      inset-inline: 0;
      top: calc(100% + 6px);
      z-index: 120;
      max-height: 320px;
      overflow: auto;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 18px 45px rgba(15, 23, 42, .18);
      padding: 8px;
    }
    .search-select-panel input {
      width: 100%;
      min-height: 40px;
      border: 1px solid #dbe3ef;
      border-radius: 8px;
      padding: 0 10px;
      margin-bottom: 8px;
      font: inherit;
    }
    .search-select-option {
      width: 100%;
      min-height: 40px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #0f172a;
      padding: 8px 10px;
      text-align: start;
      font: inherit;
      font-weight: 750;
      cursor: pointer;
    }
    .search-select-option:hover,
    .search-select-option.selected {
      background: #eff6ff;
      color: #07336b;
    }
    .search-select-option.muted { color: #64748b; }
    .search-select-panel p {
      margin: 8px;
      color: #64748b;
      font-weight: 750;
    }
  `]
})
export class SearchableSelectComponent {
  @Input() options: any[] = [];
  @Input() value: any = null;
  @Input() valueKey = '';
  @Input() placeholder = 'Select';
  @Input() searchPlaceholder = 'Search...';
  @Input() emptyText = 'No results';
  @Input() nullable = true;
  @Input() disabled = false;
  @Input() labelWith: (option: any) => string = (option) => String(option ?? '');
  @Output() valueChange = new EventEmitter<any>();

  open = false;
  query = '';

  get selectedLabel(): string {
    const selected = this.options.find((option) => this.sameValue(this.optionValue(option), this.value));
    return selected ? this.optionLabel(selected) : '';
  }

  get filteredOptions(): any[] {
    const query = this.query.trim().toLowerCase();
    if (!query) return this.options;
    return this.options.filter((option) => this.optionLabel(option).toLowerCase().includes(query));
  }

  @HostListener('document:click')
  close(): void {
    this.open = false;
  }

  toggle(): void {
    if (this.disabled) return;
    this.open = !this.open;
  }

  choose(option: any | null): void {
    this.value = option === null ? null : this.optionValue(option);
    this.valueChange.emit(this.value);
    this.open = false;
    this.query = '';
  }

  optionLabel(option: any): string {
    return this.labelWith(option);
  }

  isSelected(option: any): boolean {
    return this.sameValue(this.optionValue(option), this.value);
  }

  private optionValue(option: any): any {
    return this.valueKey ? option?.[this.valueKey] : option;
  }

  private sameValue(a: any, b: any): boolean {
    if ((a && typeof a === 'object') || (b && typeof b === 'object')) return a === b;
    return String(a ?? '') === String(b ?? '');
  }
}

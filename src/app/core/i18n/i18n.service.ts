import { Injectable, computed, effect, signal } from '@angular/core';
import { Direction } from '../models/admission.models';

export type AppLanguage = 'en' | 'ar';

const LANGUAGE_KEY = 'rawafed.language';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly language = signal<AppLanguage>(this.readSavedLanguage());
  readonly direction = computed<Direction>(() => this.language() === 'ar' ? 'rtl' : 'ltr');
  private readonly dictionary = signal<Record<string, string>>({});
  private dictionaries: Partial<Record<AppLanguage, Record<string, string>>> = {};
  private staticLocalizationQueued = false;

  constructor() {
    void this.loadDictionary(this.language());

    effect(() => {
      const language = this.language();
      const direction = this.direction();
      document.documentElement.lang = language;
      document.documentElement.dir = direction;
      localStorage.setItem(LANGUAGE_KEY, language);
      void this.loadDictionary(language).then(() => this.localizeStaticContent());
    });
  }

  setLanguage(language: AppLanguage): void {
    this.language.set(language);
  }

  toggleLanguage(): void {
    this.setLanguage(this.language() === 'en' ? 'ar' : 'en');
  }

  t(key: string, params: Record<string, unknown> = {}): string {
    const value = this.dictionary()[key] || key;
    return Object.entries(params).reduce(
      (text, [name, replacement]) => text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(replacement ?? '')),
      value
    );
  }

  label(en: string, ar?: string): string {
    return this.language() === 'ar' ? (ar || en) : en;
  }

  status(value: string | null | undefined): string {
    if (!value) return '-';
    const key = `status.${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
    return this.t(key) === key ? value : this.t(key);
  }

  money(value: number, currency = 'SAR'): string {
    return new Intl.NumberFormat(this.language() === 'ar' ? 'ar-SA' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(Number(value || 0)) + ` ${this.t(`currency.${currency}`)}`;
  }

  localizeStaticContent(): void {
    if (this.staticLocalizationQueued) return;
    this.staticLocalizationQueued = true;
    requestAnimationFrame(() => {
      this.staticLocalizationQueued = false;
      this.replaceKnownStaticPhrases();
    });
  }

  private async loadDictionary(language: AppLanguage): Promise<void> {
    try {
      const [current, english, arabic] = await Promise.all([
        this.fetchDictionary(language),
        this.fetchDictionary('en'),
        this.fetchDictionary('ar')
      ]);
      this.dictionaries = { en: english, ar: arabic, [language]: current };
      this.dictionary.set(current);
    } catch {
      this.dictionary.set({});
    }
  }

  private async fetchDictionary(language: AppLanguage): Promise<Record<string, string>> {
    if (this.dictionaries[language]) return this.dictionaries[language] || {};
    const response = await fetch(`/assets/i18n/${language}.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Missing ${language} dictionary`);
    return response.json();
  }

  private replaceKnownStaticPhrases(): void {
    const english = this.dictionaries.en || {};
    const arabic = this.dictionaries.ar || {};
    const current = this.language() === 'ar' ? arabic : english;
    const source = this.language() === 'ar' ? english : arabic;
    if (!Object.keys(current).length || !Object.keys(source).length) return;

    const phrases = new Map<string, string>();
    Object.keys(english).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = current[key];
      if (sourceValue && targetValue && sourceValue !== targetValue) phrases.set(sourceValue, targetValue);
    });

    const translate = (value: string): string => {
      const trimmed = value.trim();
      const translated = phrases.get(trimmed);
      return translated ? value.replace(trimmed, translated) : value;
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    let node = walker.nextNode();
    while (node) {
      const next = walker.nextNode();
      const updated = translate(node.textContent || '');
      if (updated !== node.textContent) node.textContent = updated;
      node = next;
    }

    document.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]').forEach((element) => {
      ['placeholder', 'title', 'aria-label'].forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (!value) return;
        const updated = translate(value);
        if (updated !== value) element.setAttribute(attribute, updated);
      });
    });
  }

  private readSavedLanguage(): AppLanguage {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return value === 'ar' ? 'ar' : 'en';
  }
}

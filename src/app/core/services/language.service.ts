import {DOCUMENT, inject, Injectable, signal} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';

export interface AppLanguage {
  readonly code: string;
  readonly label: string;
  /** Native display name shown in the language switcher. */
  readonly nativeLabel: string;
}

/**
 * Runtime language management for the authentication gateway.
 *
 * Wraps {@link TranslateService} with a signal-based API, persists the
 * user's choice, keeps the document `lang` attribute in sync and resolves
 * an appropriate initial language from storage or the browser.
 */
@Injectable({providedIn: 'root'})
export class LanguageService {
  private static readonly STORAGE_KEY = 'app_language';

  /** Languages supported by the UI. */
  readonly availableLanguages: readonly AppLanguage[] = [
    {code: 'en', label: 'English', nativeLabel: 'English'},
    {code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी'}
  ];

  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  private readonly _current = signal<string>('en');
  /** Currently active language code. */
  readonly current = this._current.asReadonly();

  constructor() {
    const codes = this.availableLanguages.map(l => l.code);
    this.translate.addLangs(codes);
    this.translate.setFallbackLang('en');

    this.use(this.resolveInitialLanguage());
  }

  /** Switch the active language and persist the selection. */
  use(code: string): void {
    if (!this.isSupported(code)) {
      code = 'en';
    }
    this._current.set(code);
    this.translate.use(code);
    localStorage.setItem(LanguageService.STORAGE_KEY, code);
    this.document.documentElement.setAttribute('lang', code);
  }

  isSupported(code: string | undefined | null): code is string {
    return !!code && this.availableLanguages.some(l => l.code === code);
  }

  private resolveInitialLanguage(): string {
    const stored = localStorage.getItem(LanguageService.STORAGE_KEY);
    if (this.isSupported(stored)) {
      return stored;
    }
    const browser = this.translate.getBrowserLang();
    return this.isSupported(browser) ? browser : 'en';
  }
}

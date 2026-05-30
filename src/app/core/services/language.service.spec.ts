import {TestBed} from '@angular/core/testing';
import {DOCUMENT} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {LanguageService} from './language.service';

class FakeTranslateService {
  addLangs = jasmine.createSpy('addLangs');
  setFallbackLang = jasmine.createSpy('setFallbackLang');
  use = jasmine.createSpy('use');
  browserLang: string | undefined = 'en';

  getBrowserLang(): string | undefined {
    return this.browserLang;
  }
}

describe('LanguageService', () => {
  let fake: FakeTranslateService;

  function createService(): LanguageService {
    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        {provide: TranslateService, useValue: fake}
      ]
    });
    return TestBed.inject(LanguageService);
  }

  beforeEach(() => {
    localStorage.clear();
    fake = new FakeTranslateService();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('registers the supported languages and an English fallback', () => {
    const service = createService();
    expect(fake.addLangs).toHaveBeenCalledWith(['en', 'hi']);
    expect(fake.setFallbackLang).toHaveBeenCalledWith('en');
    expect(service.availableLanguages.map(l => l.code)).toEqual(['en', 'hi']);
  });

  it('defaults to English when nothing is stored and the browser language is unsupported', () => {
    fake.browserLang = 'fr';
    const service = createService();
    expect(service.current()).toBe('en');
  });

  it('adopts a supported browser language when nothing is stored', () => {
    fake.browserLang = 'hi';
    const service = createService();
    expect(service.current()).toBe('hi');
    expect(fake.use).toHaveBeenCalledWith('hi');
  });

  it('restores a previously persisted language', () => {
    localStorage.setItem('app_language', 'hi');
    const service = createService();
    expect(service.current()).toBe('hi');
  });

  it('switches, persists and updates the document lang on use()', () => {
    const service = createService();
    service.use('hi');

    expect(service.current()).toBe('hi');
    expect(localStorage.getItem('app_language')).toBe('hi');
    expect(TestBed.inject(DOCUMENT).documentElement.getAttribute('lang')).toBe('hi');
    expect(fake.use).toHaveBeenCalledWith('hi');
  });

  it('falls back to English for an unsupported use()', () => {
    const service = createService();
    service.use('xx');
    expect(service.current()).toBe('en');
  });

  it('reports language support correctly', () => {
    const service = createService();
    expect(service.isSupported('en')).toBeTrue();
    expect(service.isSupported('hi')).toBeTrue();
    expect(service.isSupported('de')).toBeFalse();
    expect(service.isSupported(null)).toBeFalse();
  });
});

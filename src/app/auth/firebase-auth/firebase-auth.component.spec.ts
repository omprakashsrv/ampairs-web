import {ComponentFixture, TestBed} from '@angular/core/testing';
import {signal, WritableSignal} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {provideTranslateService} from '@ngx-translate/core';
import {of} from 'rxjs';

import {FirebaseAuthComponent} from './firebase-auth.component';
import {FirebaseAuthService} from '../../core/services/firebase-auth.service';
import {AuthService} from '../../core/services/auth.service';
import {DeviceService} from '../../core/services/device.service';
import {LanguageService} from '../../core/services/language.service';
import {ThemeService, ThemeMode} from '../../core/services/theme.service';

class FakeFirebaseAuthService {
  loading = signal(false);
  error = signal<string | null>(null);
  initRecaptcha = jasmine.createSpy('initRecaptcha');
  resetRecaptcha = jasmine.createSpy('resetRecaptcha');
  sendOTP = jasmine.createSpy('sendOTP').and.resolveTo(undefined);
  verifyOTP = jasmine.createSpy('verifyOTP').and.resolveTo('firebase-id-token');
}

class FakeAuthService {
  authenticateWithFirebase = jasmine.createSpy('authenticateWithFirebase').and.resolveTo({
    access_token: 'access-123',
    refresh_token: 'refresh-456'
  });
}

class FakeDeviceService {
  getDeviceInfo(): Record<string, string> {
    return {
      device_id: 'dev-1',
      device_name: 'Test Device',
      device_type: 'desktop',
      platform: 'web',
      browser: 'chrome',
      os: 'linux',
      user_agent: 'jasmine'
    };
  }
}

class FakeLanguageService {
  availableLanguages = [
    {code: 'en', label: 'English', nativeLabel: 'English'},
    {code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी'}
  ];
  current = signal('en');
  use = jasmine.createSpy('use');
}

class FakeThemeService {
  themeMode: WritableSignal<ThemeMode> = signal<ThemeMode>('system');
  toggleTheme = jasmine.createSpy('toggleTheme');
}

describe('FirebaseAuthComponent', () => {
  let fixture: ComponentFixture<FirebaseAuthComponent>;
  let component: FirebaseAuthComponent;
  let firebase: FakeFirebaseAuthService;
  let language: FakeLanguageService;
  let theme: FakeThemeService;

  beforeEach(async () => {
    firebase = new FakeFirebaseAuthService();
    language = new FakeLanguageService();
    theme = new FakeThemeService();

    await TestBed.configureTestingModule({
      imports: [FirebaseAuthComponent],
      providers: [
        provideNoopAnimations(),
        provideTranslateService(),
        {provide: FirebaseAuthService, useValue: firebase},
        {provide: AuthService, useValue: new FakeAuthService()},
        {provide: DeviceService, useValue: new FakeDeviceService()},
        {provide: LanguageService, useValue: language},
        {provide: ThemeService, useValue: theme},
        {provide: ActivatedRoute, useValue: {queryParams: of({})}}
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FirebaseAuthComponent);
    component = fixture.componentInstance;
    // The deep-link helper navigates via window.location; stub it so the test
    // runner page is never navigated away during success-flow assertions.
    spyOn(component as unknown as {attemptDeepLink(): void}, 'attemptDeepLink');
    fixture.detectChanges();
  });

  it('creates and starts on the phone step', () => {
    expect(component).toBeTruthy();
    expect(component.step()).toBe('phone');
  });

  it('validates the phone number (Indian 10-digit pattern)', () => {
    const phone = component.phoneForm.get('phone')!;

    phone.setValue('');
    expect(phone.valid).toBeFalse();

    phone.setValue('12345');
    expect(phone.valid).toBeFalse();

    phone.setValue('1234567890'); // must start 6-9
    expect(phone.valid).toBeFalse();

    phone.setValue('9876543210');
    expect(phone.valid).toBeTrue();
  });

  it('validates the OTP (six digits)', () => {
    const otp = component.otpForm.get('otp')!;

    otp.setValue('12ab56');
    expect(otp.valid).toBeFalse();

    otp.setValue('123');
    expect(otp.valid).toBeFalse();

    otp.setValue('123456');
    expect(otp.valid).toBeTrue();
  });

  it('reflects the current theme mode in the toggle icon', () => {
    expect(component.themeIcon()).toBe('brightness_auto');

    theme.themeMode.set('light');
    expect(component.themeIcon()).toBe('light_mode');

    theme.themeMode.set('dark');
    expect(component.themeIcon()).toBe('dark_mode');
  });

  it('delegates language switching and theme cycling', () => {
    component.switchLanguage('hi');
    expect(language.use).toHaveBeenCalledWith('hi');

    component.cycleTheme();
    expect(theme.toggleTheme).toHaveBeenCalled();
  });

  it('moves to the OTP step after a valid phone submission', async () => {
    component.phoneForm.get('phone')!.setValue('9876543210');

    await component.onSendOTP();

    expect(firebase.sendOTP).toHaveBeenCalledWith('+919876543210');
    expect(component.step()).toBe('otp');
    expect(component.maskedPhone()).toBe('••••••3210');
  });

  it('does not send an OTP when the phone form is invalid', async () => {
    component.phoneForm.get('phone')!.setValue('123');
    await component.onSendOTP();
    expect(firebase.sendOTP).not.toHaveBeenCalled();
    expect(component.step()).toBe('phone');
  });

  it('returns to the phone step from the OTP step', () => {
    component.step.set('otp');
    component.otpForm.get('otp')!.setValue('123456');

    component.onBackToPhone();

    expect(component.step()).toBe('phone');
    expect(component.otpForm.get('otp')!.value).toBeNull();
  });

  it('exchanges the Firebase token and reaches the success step', async () => {
    component.phoneForm.get('phone')!.setValue('9876543210');
    component.otpForm.get('otp')!.setValue('123456');

    await component.onVerifyOTP();

    expect(firebase.verifyOTP).toHaveBeenCalledWith('123456');
    expect(component.step()).toBe('success');
    expect(component.tokensJson()).toContain('access-123');
    expect(component.tokensJson()).toContain('refresh-456');
  });
});

import {Component, computed, inject, OnDestroy, OnInit, signal} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSnackBar, MatSnackBarModule} from '@angular/material/snack-bar';
import {MatDividerModule} from '@angular/material/divider';
import {TranslatePipe, TranslateService} from '@ngx-translate/core';

import {FirebaseAuthService} from '../../core/services/firebase-auth.service';
import {AuthService} from '../../core/services/auth.service';
import {DeviceService} from '../../core/services/device.service';
import {LanguageService} from '../../core/services/language.service';
import {ThemeService} from '../../core/services/theme.service';
import {environment} from '../../../environments/environment';

type AuthStep = 'phone' | 'otp' | 'success';

@Component({
  selector: 'app-firebase-auth',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDividerModule,
    TranslatePipe
  ],
  templateUrl: './firebase-auth.component.html',
  styleUrl: './firebase-auth.component.scss'
})
export class FirebaseAuthComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly firebaseAuth = inject(FirebaseAuthService);
  private readonly authService = inject(AuthService);
  private readonly deviceService = inject(DeviceService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);

  readonly phoneForm: FormGroup = this.fb.group({
    // Fixed to India (+91) for now.
    countryCode: [91],
    phone: ['', [Validators.required, Validators.pattern('^[6-9][0-9]{9}$')]]
  });

  readonly otpForm: FormGroup = this.fb.group({
    otp: ['', [Validators.required, Validators.pattern('^[0-9]{6}$')]]
  });

  readonly step = signal<AuthStep>('phone');
  readonly countdown = signal(0);
  readonly maskedPhone = signal('');

  // App token handoff
  readonly tokensJson = signal('');
  readonly tokensCopied = signal(false);
  private accessToken = '';
  private refreshToken = '';

  // Theme toggle icon reflects the current mode (system / light / dark).
  readonly themeIcon = computed(() => {
    switch (this.theme.themeMode()) {
      case 'light':
        return 'light_mode';
      case 'dark':
        return 'dark_mode';
      default:
        return 'brightness_auto';
    }
  });

  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    // Initialise reCAPTCHA once the container is in the DOM.
    setTimeout(() => this.firebaseAuth.initRecaptcha('recaptcha-container'), 100);
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    this.firebaseAuth.resetRecaptcha();
  }

  get firebaseAuthService(): FirebaseAuthService {
    return this.firebaseAuth;
  }

  switchLanguage(code: string): void {
    this.language.use(code);
  }

  cycleTheme(): void {
    this.theme.toggleTheme();
  }

  async onSendOTP(): Promise<void> {
    if (this.phoneForm.invalid) {
      return;
    }

    const {countryCode, phone} = this.phoneForm.value;
    const fullPhoneNumber = `+${countryCode}${phone}`;

    try {
      await this.firebaseAuth.sendOTP(fullPhoneNumber);
      this.maskedPhone.set(this.maskPhoneNumber(phone));
      this.step.set('otp');
      this.startCountdown(30);
      this.showMessage(this.translate.instant('auth.messages.otpSent'));
    } catch {
      this.showMessage(this.translate.instant('auth.messages.otpSendFailed'), 'error');
    }
  }

  async onVerifyOTP(): Promise<void> {
    if (this.otpForm.invalid) {
      return;
    }

    const {otp} = this.otpForm.value;

    try {
      // 1. Verify OTP with Firebase to obtain a Firebase ID token.
      const firebaseToken = await this.firebaseAuth.verifyOTP(otp);

      // 2. Exchange the Firebase token for backend JWT tokens.
      const {countryCode, phone} = this.phoneForm.value;
      const deviceInfo = this.deviceService.getDeviceInfo();

      const authResponse = await this.authService.authenticateWithFirebase({
        firebase_id_token: firebaseToken,
        country_code: countryCode,
        phone: phone,
        device_id: deviceInfo.device_id,
        device_name: deviceInfo.device_name,
        device_type: deviceInfo.device_type,
        platform: deviceInfo.platform,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        user_agent: deviceInfo.user_agent
      });

      this.accessToken = authResponse.access_token;
      this.refreshToken = authResponse.refresh_token;

      // 3. Show success and hand the tokens off to the app.
      this.step.set('success');
      this.prepareTokenHandoff();
      this.showMessage(this.translate.instant('auth.messages.authSuccess'));
    } catch {
      this.showMessage(this.translate.instant('auth.messages.invalidOtp'), 'error');
    }
  }

  async onResendOTP(): Promise<void> {
    if (this.countdown() > 0) {
      return;
    }

    this.firebaseAuth.resetRecaptcha();
    setTimeout(() => this.firebaseAuth.initRecaptcha('recaptcha-container'), 100);
    await this.onSendOTP();
  }

  onBackToPhone(): void {
    this.step.set('phone');
    this.otpForm.reset();
    this.clearCountdown();
  }

  openApp(): void {
    this.attemptDeepLink();
  }

  copyTokens(): void {
    const text = this.tokensJson();

    if (!navigator.clipboard) {
      this.copyToClipboardFallback(text);
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() => this.markCopied())
      .catch(() => this.showMessage(this.translate.instant('auth.messages.copyFailed'), 'error'));
  }

  // --- helpers -------------------------------------------------------------

  private prepareTokenHandoff(): void {
    this.tokensJson.set(JSON.stringify({
      access_token: this.accessToken,
      refresh_token: this.refreshToken
    }, null, 2));

    // Best-effort automatic deep link into the desktop/native app.
    this.attemptDeepLink();
  }

  private attemptDeepLink(): void {
    const {scheme, host} = environment.deepLink;
    const deepLink =
      `${scheme}://${host}?access_token=${encodeURIComponent(this.accessToken)}` +
      `&refresh_token=${encodeURIComponent(this.refreshToken)}`;

    try {
      window.location.href = deepLink;
    } catch (error) {
      console.error('Failed to open deep link:', error);
    }
  }

  private markCopied(): void {
    this.tokensCopied.set(true);
    this.showMessage(this.translate.instant('auth.messages.tokensCopied'));
    setTimeout(() => this.tokensCopied.set(false), 5000);
  }

  private copyToClipboardFallback(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      if (document.execCommand('copy')) {
        this.markCopied();
      } else {
        throw new Error('Copy command failed');
      }
    } catch {
      this.showMessage(this.translate.instant('auth.messages.copyFailed'), 'error');
    } finally {
      document.body.removeChild(textArea);
    }
  }

  private maskPhoneNumber(phone: string): string {
    if (phone.length < 4) {
      return phone;
    }
    const lastFour = phone.slice(-4);
    return '•'.repeat(phone.length - 4) + lastFour;
  }

  private startCountdown(seconds: number): void {
    this.countdown.set(seconds);
    this.countdownInterval = setInterval(() => {
      const current = this.countdown();
      if (current > 0) {
        this.countdown.set(current - 1);
      } else {
        this.clearCountdown();
      }
    }, 1000);
  }

  private clearCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.countdown.set(0);
  }

  private showMessage(message: string, type: 'success' | 'error' = 'success'): void {
    this.snackBar.open(message, this.translate.instant('common.close'), {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: type === 'error' ? ['error-snackbar'] : ['success-snackbar']
    });
  }
}

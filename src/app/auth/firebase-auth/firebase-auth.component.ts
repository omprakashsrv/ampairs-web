import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { FirebaseAuthService } from '../../core/services/firebase-auth.service';
import { AuthService } from '../../core/services/auth.service';
import { DeviceService } from '../../core/services/device.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-firebase-auth',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatChipsModule,
    MatDividerModule
  ],
  templateUrl: './firebase-auth.component.html',
  styleUrl: './firebase-auth.component.scss'
})
export class FirebaseAuthComponent implements OnInit, OnDestroy {
  phoneForm: FormGroup;
  otpForm: FormGroup;

  step = signal<'phone' | 'otp' | 'success'>('phone');
  countdown = signal(0);
  maskedPhone = signal('');

  // Desktop client authentication
  isDesktopClient = signal(false);
  tokensJson = signal('');
  tokensCopied = signal(false);
  private accessToken = '';
  private refreshToken = '';

  private countdownInterval: any;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private firebaseAuth: FirebaseAuthService,
    private authService: AuthService,
    private deviceService: DeviceService,
    private snackBar: MatSnackBar
  ) {
    // Fixed to India only (+91)
    this.phoneForm = this.fb.group({
      countryCode: [91],
      phone: ['', [
        Validators.required,
        Validators.pattern('^[6-9][0-9]{9}$')
      ]]
    });

    this.otpForm = this.fb.group({
      otp: ['', [
        Validators.required,
        Validators.pattern('^[0-9]{6}$')
      ]]
    });
  }

  ngOnInit(): void {
    // Detect desktop client from query parameter
    this.route.queryParams.subscribe(params => {
      this.isDesktopClient.set(params['client'] === 'desktop');
      console.log('Desktop client detected:', this.isDesktopClient());
    });

    // Initialize reCAPTCHA after view is ready
    setTimeout(() => {
      this.firebaseAuth.initRecaptcha('recaptcha-container');
    }, 100);
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    this.firebaseAuth.resetRecaptcha();
  }

  async onSendOTP(): Promise<void> {
    if (this.phoneForm.invalid) {
      return;
    }

    const { countryCode, phone } = this.phoneForm.value;
    const fullPhoneNumber = `+${countryCode}${phone}`;

    try {
      await this.firebaseAuth.sendOTP(fullPhoneNumber);
      this.maskedPhone.set(this.maskPhoneNumber(phone));
      this.step.set('otp');
      this.startCountdown(30);
      this.showMessage('OTP sent successfully');
    } catch (error: any) {
      this.showMessage(error.message || 'Failed to send OTP', 'error');
    }
  }

  async onVerifyOTP(): Promise<void> {
    if (this.otpForm.invalid) {
      return;
    }

    const { otp } = this.otpForm.value;

    try {
      // Step 1: Verify OTP with Firebase and get Firebase ID token
      const firebaseToken = await this.firebaseAuth.verifyOTP(otp);

      // Step 2: Exchange Firebase token for backend JWT tokens
      const { countryCode, phone } = this.phoneForm.value;
      const deviceInfo = await this.deviceService.getDeviceInfo();

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

      // Store tokens for desktop auth
      this.accessToken = authResponse.access_token;
      this.refreshToken = authResponse.refresh_token;

      // Step 3: Redirect based on platform
      this.step.set('success');

      // Handle desktop client authentication (browser-based)
      if (this.isDesktopClient()) {
        this.handleDesktopAuth();
        return;
      }

      this.showMessage('Authentication successful!');
      this.redirectToDesktopApp(authResponse.access_token, authResponse.refresh_token);
    } catch (error: any) {
      this.showMessage(error.message || 'Invalid OTP code', 'error');
    }
  }

  async onResendOTP(): Promise<void> {
    if (this.countdown() > 0) {
      return;
    }

    // Reset and reinitialize reCAPTCHA
    this.firebaseAuth.resetRecaptcha();
    setTimeout(() => {
      this.firebaseAuth.initRecaptcha('recaptcha-container');
    }, 100);

    await this.onSendOTP();
  }

  onBackToPhone(): void {
    this.step.set('phone');
    this.otpForm.reset();
    this.clearCountdown();
  }

  private redirectToDesktopApp(accessToken: string, refreshToken: string): void {
    // Check if we're in a desktop app context or web browser
    const isDesktopApp = this.isRunningInDesktopApp();

    if (isDesktopApp) {
      // Try deep link for desktop app
      const { scheme, host } = environment.deepLink;
      const deepLink = `${scheme}://${host}?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;

      try {
        window.location.href = deepLink;
      } catch (error) {
        console.error('Failed to open deep link:', error);
        this.redirectToWorkspaces();
      }
    } else {
      // For web browsers, redirect to workspaces page
      // Tokens are already stored by authService
      this.redirectToWorkspaces();
    }
  }

  private isRunningInDesktopApp(): boolean {
    // Check if running in Electron or other desktop wrapper
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('electron') ||
           userAgent.includes('ampairs-desktop') ||
           (window as any).isDesktopApp === true;
  }

  private redirectToWorkspaces(): void {
    // Use Angular router for navigation
    setTimeout(() => {
      window.location.href = '/workspaces';
    }, 1500);
  }

  private maskPhoneNumber(phone: string): string {
    if (phone.length < 4) {
      return phone;
    }
    const lastFour = phone.slice(-4);
    const masked = '*'.repeat(phone.length - 4);
    return masked + lastFour;
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
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: type === 'error' ? ['error-snackbar'] : ['success-snackbar']
    });
  }

  // Getter for template access
  get firebaseAuthService() {
    return this.firebaseAuth;
  }

  /**
   * Handle desktop authentication completion (browser-based flow)
   */
  private handleDesktopAuth(): void {
    // Generate JSON for manual copy
    this.tokensJson.set(JSON.stringify({
      access_token: this.accessToken,
      refresh_token: this.refreshToken
    }, null, 2));

    // Attempt automatic deep link
    this.attemptDeepLink();

    this.showMessage('Authentication successful! Connecting to desktop app...');
  }

  /**
   * Attempt to open desktop app via deep link (browser-based flow)
   */
  private attemptDeepLink(): void {
    const deepLinkUrl = `ampairs://auth?access_token=${encodeURIComponent(this.accessToken)}&refresh_token=${encodeURIComponent(this.refreshToken)}`;

    try {
      window.location.href = deepLinkUrl;
      console.log('Desktop deep link triggered:', deepLinkUrl);
    } catch (error) {
      console.error('Failed to trigger deep link:', error);
      // Fallback UI is already visible
    }
  }

  /**
   * Copy tokens to clipboard (for desktop client)
   */
  copyTokensToClipboard(): void {
    const tokensText = this.tokensJson();

    if (!navigator.clipboard) {
      // Fallback for older browsers
      this.copyToClipboardFallback(tokensText);
      return;
    }

    navigator.clipboard.writeText(tokensText)
      .then(() => {
        this.tokensCopied.set(true);
        this.showMessage('Tokens copied! Paste them in the desktop app.');

        // Reset copied state after 5 seconds
        setTimeout(() => this.tokensCopied.set(false), 5000);
      })
      .catch(err => {
        console.error('Failed to copy tokens:', err);
        this.showMessage('Failed to copy. Please select and copy manually.', 'error');
      });
  }

  /**
   * Fallback method for copying to clipboard in older browsers
   */
  private copyToClipboardFallback(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.tokensCopied.set(true);
        this.showMessage('Tokens copied! Paste them in the desktop app.');
        setTimeout(() => this.tokensCopied.set(false), 5000);
      } else {
        throw new Error('Copy command failed');
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      this.showMessage('Failed to copy. Please select and copy manually.', 'error');
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

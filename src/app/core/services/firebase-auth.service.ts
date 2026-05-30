import { Injectable, signal } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  PhoneAuthProvider,
  signInWithCredential
} from 'firebase/auth';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FirebaseAuthService {
  private app: FirebaseApp;
  private auth: Auth;
  private recaptchaVerifier: RecaptchaVerifier | null = null;
  private confirmationResult: ConfirmationResult | null = null;

  loading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    // Reuse the existing Firebase app if one is already initialised
    // (avoids duplicate-app errors under HMR and in unit tests).
    this.app = getApps().length ? getApp() : initializeApp(environment.firebase);
    this.auth = getAuth(this.app);
  }

  /**
   * Initialize reCAPTCHA verifier
   * @param containerId - HTML element ID for reCAPTCHA
   */
  initRecaptcha(containerId: string): void {
    try {
      this.recaptchaVerifier = new RecaptchaVerifier(
        this.auth,
        containerId,
        {
          size: 'normal',
          callback: () => {
            // reCAPTCHA solved
            console.log('reCAPTCHA verified');
          },
          'expired-callback': () => {
            // Response expired
            this.error.set('auth.firebaseErrors.recaptchaExpired');
          }
        }
      );
    } catch (error) {
      console.error('Error initializing reCAPTCHA:', error);
      this.error.set('auth.firebaseErrors.recaptchaInit');
    }
  }

  /**
   * Send OTP to phone number
   * @param phoneNumber - Full phone number with country code (e.g., +919876543210)
   * @returns Promise that resolves when OTP is sent
   */
  async sendOTP(phoneNumber: string): Promise<void> {
    if (!this.recaptchaVerifier) {
      throw new Error('reCAPTCHA not initialized. Call initRecaptcha() first.');
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      this.confirmationResult = await signInWithPhoneNumber(
        this.auth,
        phoneNumber,
        this.recaptchaVerifier
      );
      console.log('OTP sent successfully');
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      this.error.set(this.getErrorKey(error));
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Verify OTP code
   * @param code - 6-digit OTP code
   * @returns Firebase ID token for backend authentication
   */
  async verifyOTP(code: string): Promise<string> {
    if (!this.confirmationResult) {
      throw new Error('No confirmation result available. Send OTP first.');
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const userCredential = await this.confirmationResult.confirm(code);
      const idToken = await userCredential.user.getIdToken();
      console.log('OTP verified successfully');
      return idToken;
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      this.error.set(this.getErrorKey(error));
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Reset reCAPTCHA verifier (useful for retries)
   */
  resetRecaptcha(): void {
    if (this.recaptchaVerifier) {
      this.recaptchaVerifier.clear();
      this.recaptchaVerifier = null;
    }
    this.confirmationResult = null;
    this.error.set(null);
  }

  /**
   * Map a Firebase auth error to a translation key so the UI can localise it.
   */
  private getErrorKey(error: any): string {
    const errorCode = error?.code || '';

    switch (errorCode) {
      case 'auth/invalid-phone-number':
        return 'auth.firebaseErrors.invalidPhone';
      case 'auth/missing-phone-number':
        return 'auth.firebaseErrors.missingPhone';
      case 'auth/too-many-requests':
        return 'auth.firebaseErrors.tooManyRequests';
      case 'auth/invalid-verification-code':
        return 'auth.firebaseErrors.invalidCode';
      case 'auth/code-expired':
        return 'auth.firebaseErrors.codeExpired';
      case 'auth/captcha-check-failed':
        return 'auth.firebaseErrors.captchaFailed';
      default:
        return 'auth.firebaseErrors.generic';
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
      this.resetRecaptcha();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }
}

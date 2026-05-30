import {TestBed} from '@angular/core/testing';
import {FirebaseAuthService} from './firebase-auth.service';

describe('FirebaseAuthService', () => {
  let service: FirebaseAuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [FirebaseAuthService]});
    service = TestBed.inject(FirebaseAuthService);
  });

  it('starts in an idle state', () => {
    expect(service.loading()).toBeFalse();
    expect(service.error()).toBeNull();
  });

  it('maps known Firebase error codes to translation keys', () => {
    const mapError = (error: unknown): string =>
      (service as unknown as { getErrorKey(e: unknown): string }).getErrorKey(error);

    expect(mapError({code: 'auth/invalid-phone-number'})).toBe('auth.firebaseErrors.invalidPhone');
    expect(mapError({code: 'auth/missing-phone-number'})).toBe('auth.firebaseErrors.missingPhone');
    expect(mapError({code: 'auth/too-many-requests'})).toBe('auth.firebaseErrors.tooManyRequests');
    expect(mapError({code: 'auth/invalid-verification-code'})).toBe('auth.firebaseErrors.invalidCode');
    expect(mapError({code: 'auth/code-expired'})).toBe('auth.firebaseErrors.codeExpired');
    expect(mapError({code: 'auth/captcha-check-failed'})).toBe('auth.firebaseErrors.captchaFailed');
  });

  it('falls back to a generic key for unknown errors', () => {
    const mapError = (error: unknown): string =>
      (service as unknown as { getErrorKey(e: unknown): string }).getErrorKey(error);

    expect(mapError({code: 'auth/some-new-code'})).toBe('auth.firebaseErrors.generic');
    expect(mapError({})).toBe('auth.firebaseErrors.generic');
    expect(mapError(null)).toBe('auth.firebaseErrors.generic');
  });

  it('clears the error signal on resetRecaptcha()', () => {
    service.error.set('auth.firebaseErrors.generic');
    service.resetRecaptcha();
    expect(service.error()).toBeNull();
  });

  it('rejects verifyOTP() when no OTP was requested first', async () => {
    await expectAsync(service.verifyOTP('123456')).toBeRejected();
  });

  it('rejects sendOTP() when reCAPTCHA was not initialised', async () => {
    await expectAsync(service.sendOTP('+919876543210')).toBeRejected();
  });
});

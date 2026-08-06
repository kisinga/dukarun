import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@dukarun/auth';
import { formatPhoneNumber, validatePhoneNumber } from '../../../shared/utils/phone.utils';

type LoginStep = 'phone' | 'otp';

@Component({
  selector: 'app-login',
  imports: [RouterLink, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Form state
  protected readonly currentStep = signal<LoginStep>('phone');
  protected readonly phoneNumber = signal('');
  protected readonly otpCode = signal('');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly canResendOTP = signal(false);
  protected readonly resendCooldown = signal(0);
  protected readonly isVerifying = signal(false); // Prevent duplicate verification attempts

  // Computed values
  protected readonly formattedPhone = computed(() => {
    const phone = this.phoneNumber();
    if (!phone) return '';
    try {
      return formatPhoneNumber(phone);
    } catch {
      return phone;
    }
  });

  protected readonly isPhoneValid = computed(() => {
    const phone = this.formattedPhone();
    return phone ? validatePhoneNumber(phone) : false;
  });

  protected readonly isLoadingAny = computed(
    () => this.isLoading() || this.authService.isLoading(),
  );

  private otpTimer: any = null;

  ngOnDestroy(): void {
    if (this.otpTimer) {
      clearInterval(this.otpTimer);
    }
  }

  protected async onRequestOTP(): Promise<void> {
    const phone = this.formattedPhone();

    if (!phone || !this.isPhoneValid()) {
      this.errorMessage.set('Please enter a valid Kenyan phone number (e.g.07XXXXXXXXX)');
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);

    try {
      await this.authService.requestLoginOTP(phone);

      this.currentStep.set('otp');
      this.otpCode.set('');
      this.startOTPResendCooldown();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to send OTP. Please try again.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async onVerifyOTP(): Promise<void> {
    // Prevent duplicate verification attempts
    if (this.isVerifying() || this.isLoading()) {
      console.log('[LOGIN] Verification already in progress, ignoring duplicate call');
      return;
    }

    const otp = this.otpCode().trim();

    if (!otp || otp.length !== 6) {
      this.errorMessage.set('Please enter a valid 6-digit OTP code');
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);
    this.isVerifying.set(true);

    try {
      const phone = this.formattedPhone();
      console.log('[LOGIN] Starting OTP verification for', phone);
      await this.authService.loginWithOTP(phone, otp);

      // Successful login - redirect to dashboard
      console.log('[LOGIN] OTP verified successfully, redirecting to dashboard');
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('[LOGIN] OTP verification failed:', error);
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Login failed. Please try again.',
      );
      // Clear OTP input on error
      this.otpCode.set('');
    } finally {
      this.isLoading.set(false);
      this.isVerifying.set(false);
    }
  }

  protected async onResendOTP(): Promise<void> {
    if (!this.canResendOTP() || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const phone = this.formattedPhone();
      await this.authService.requestLoginOTP(phone);

      this.otpCode.set('');
      this.startOTPResendCooldown();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to resend OTP. Please try again.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  protected goBackToPhone(): void {
    this.currentStep.set('phone');
    this.otpCode.set('');
    this.errorMessage.set(null);
    if (this.otpTimer) {
      clearInterval(this.otpTimer);
      this.otpTimer = null;
    }
    this.canResendOTP.set(false);
    this.resendCooldown.set(0);
  }

  private startOTPResendCooldown(): void {
    this.canResendOTP.set(false);
    this.resendCooldown.set(60); // 60 seconds cooldown

    if (this.otpTimer) {
      clearInterval(this.otpTimer);
    }

    this.otpTimer = setInterval(() => {
      const remaining = this.resendCooldown();
      if (remaining <= 1) {
        this.canResendOTP.set(true);
        this.resendCooldown.set(0);
        if (this.otpTimer) {
          clearInterval(this.otpTimer);
          this.otpTimer = null;
        }
      } else {
        this.resendCooldown.set(remaining - 1);
      }
    }, 1000);
  }

  protected onOTPInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 6);
    this.otpCode.set(value);

    // Auto-submit when 6 digits entered (only if not already verifying)
    if (value.length === 6 && !this.isVerifying() && !this.isLoading()) {
      // Use setTimeout to ensure this runs after any other handlers and debounce
      setTimeout(() => {
        // Double-check conditions before auto-submitting
        if (!this.isVerifying() && !this.isLoading() && this.otpCode().trim().length === 6) {
          console.log('[LOGIN] Auto-submitting OTP after 6 digits entered');
          this.onVerifyOTP();
        }
      }, 150); // Slightly longer delay to prevent race conditions
    }
  }
}

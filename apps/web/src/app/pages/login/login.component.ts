import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { normalizeKenyanPhone } from '../../core/phone';
import { LegalService } from '../../legal/legal.service';

const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="dashboard-main flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div class="card w-full max-w-sm bg-base-100">
        <div class="card-body">
          <h1 class="type-title">Dukarun</h1>
          <p class="text-sm text-base-content/70">Sign in with your phone number</p>

          @if (step() === 'phone') {
            <form (submit)="$event.preventDefault(); sendOtp()" class="mt-4 flex flex-col gap-4">
              <label class="form-control">
                <span class="label-text mb-1">Phone number</span>
                <input
                  type="tel"
                  class="input input-bordered w-full"
                  placeholder="0712 345 678"
                  autocomplete="tel"
                  [formControl]="phone"
                />
              </label>
              <button type="submit" class="btn btn-primary" [disabled]="sending()">
                {{ sending() ? 'Sending…' : 'Send code' }}
              </button>
            </form>
          } @else {
            <form (submit)="$event.preventDefault(); verifyOtp()" class="mt-4 flex flex-col gap-4">
              <p class="text-sm">
                Enter the 6-digit code sent by SMS and WhatsApp to
                <strong>{{ phoneE164() }}</strong>
              </p>
              <input
                type="text"
                inputmode="numeric"
                class="input input-bordered w-full text-center tracking-widest"
                placeholder="123456"
                maxlength="6"
                autocomplete="one-time-code"
                [formControl]="otp"
              />
              <button type="submit" class="btn btn-primary" [disabled]="sending()">
                {{ sending() ? 'Verifying…' : 'Verify' }}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                [disabled]="cooldown() > 0"
                (click)="sendOtp()"
              >
                {{ cooldown() > 0 ? 'Resend in ' + cooldown() + 's' : 'Resend code' }}
              </button>
              <button type="button" class="btn btn-link btn-sm" (click)="step.set('phone')">
                Change number
              </button>
            </form>
          }

          @if (error()) {
            <p class="mt-2 text-sm text-error">{{ error() }}</p>
          }
          <p class="mt-5 text-center text-xs text-base-content/55">
            <a routerLink="/privacy" class="link link-hover">Privacy</a>
            <span aria-hidden="true"> · </span>
            <a routerLink="/terms" class="link link-hover">Terms</a>
          </p>
        </div>
      </div>
    </main>
  `,
})
export class LoginComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly legal = inject(LegalService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly step = signal<'phone' | 'otp'>('phone');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cooldown = signal(0);
  protected readonly phoneE164 = signal('');

  protected readonly phone = new FormControl('', { nonNullable: true });
  protected readonly otp = new FormControl('', { nonNullable: true });

  private cooldownTimer: ReturnType<typeof setInterval> | null = null;
  private readonly requestedPlanCode = this.route.snapshot.queryParamMap.get('plan');

  constructor() {
    this.destroyRef.onDestroy(() => this.clearCooldownTimer());
  }

  protected async sendOtp(): Promise<void> {
    const normalized = normalizeKenyanPhone(this.phone.value);
    if (!normalized) {
      this.error.set('Enter a valid Kenyan number, e.g. 0712345678 or +254712345678');
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.client.auth.signInWithOtp({ phone: normalized });
      if (error) throw error;
      this.phoneE164.set(normalized);
      this.step.set('otp');
      this.startCooldown();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      this.sending.set(false);
    }
  }

  protected async verifyOtp(): Promise<void> {
    this.sending.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.client.auth.verifyOtp({
        phone: this.phoneE164(),
        token: this.otp.value.trim(),
        type: 'sms',
      });
      if (error) throw error;
      // OTP-issued tokens lack the custom claims (company_id, user_role);
      // refresh so permission-gated RPCs (settle/void/override) work.
      await this.supabase.client.auth.refreshSession();
      const hasCompanyClaim = Boolean(this.supabase.claims()?.company_id);
      if (hasCompanyClaim) {
        await this.router.navigate(['/dashboard']);
        return;
      }

      let target = '/register';
      try {
        const legalStatus = await this.legal.refresh();
        if (legalStatus.company_status === 'unapproved') target = '/company/pending';
      } catch {
        await this.router.navigate(['/company/pending'], {
          queryParams: { returnUrl: '/register' },
        });
        return;
      }
      await this.router.navigate([target], {
        queryParams:
          target === '/register' ? { plan: this.requestedPlanCode ?? undefined } : undefined,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      this.sending.set(false);
    }
  }

  private startCooldown(): void {
    this.clearCooldownTimer();
    this.cooldown.set(RESEND_COOLDOWN_SECONDS);
    this.cooldownTimer = setInterval(() => {
      const remaining = this.cooldown() - 1;
      this.cooldown.set(remaining);
      if (remaining <= 0) this.clearCooldownTimer();
    }, 1000);
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }
}

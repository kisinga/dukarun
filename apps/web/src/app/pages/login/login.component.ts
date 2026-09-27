import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { normalizeKenyanPhone } from '../../core/phone';
import { LegalService } from '../../legal/legal.service';
import { siteUrl } from '../../core/public-url';
import { hasRegistrationIntent } from '../../core/registration-intent';
import { IconComponent } from '../../shared/ui/icon.component';

const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    <main
      class="dashboard-main flex min-h-screen items-center justify-center bg-base-200 p-4 sm:p-6"
    >
      <section class="surface-card grid w-full max-w-4xl overflow-hidden lg:grid-cols-2">
        <aside
          class="hidden flex-col justify-between border-r border-base-300 bg-base-200/50 p-8 lg:flex"
          aria-label="About Dukarun"
        >
          <div>
            <div class="flex items-center gap-3">
              <img
                src="/assets/logo/dukarun-icon-dark.svg"
                alt=""
                class="h-11 w-11"
                width="44"
                height="48"
              />
              <span class="type-title">Dukarun</span>
            </div>

            <div class="mt-12 max-w-sm">
              <h2 class="type-hero">Your shop, clearly in hand.</h2>
              <p class="mt-3 text-sm leading-relaxed text-base-content/70">
                Sales, stock, customers, and cash in one place.
              </p>
            </div>
          </div>

          <p class="type-caption flex items-center gap-2">
            <app-icon name="heroLockClosed" size="sm" />
            Password-free sign-in for your team
          </p>
        </aside>

        <div class="flex min-h-[32rem] flex-col p-6 sm:p-8">
          <div class="flex items-center gap-3 lg:hidden">
            <img
              src="/assets/logo/dukarun-icon-dark.svg"
              alt=""
              class="h-10 w-10"
              width="40"
              height="44"
            />
            <span class="type-title">Dukarun</span>
          </div>

          <div class="my-auto py-8 lg:py-4">
            <div class="mb-6">
              <h1 class="type-title">Sign in to Dukarun</h1>
              <p class="mt-1.5 text-sm text-base-content/70">
                We'll send a secure code to your phone.
              </p>
            </div>

            @if (step() === 'phone') {
              <form
                (submit)="$event.preventDefault(); sendOtp()"
                class="flex flex-col gap-4"
                novalidate
              >
                <label class="form-control" for="phone-number">
                  <span class="label-text mb-1 flex items-center justify-between gap-2">
                    <span>Phone number</span>
                    <span class="type-caption">Kenya</span>
                  </span>
                  <input
                    id="phone-number"
                    type="tel"
                    inputmode="tel"
                    class="input input-bordered min-h-11 w-full"
                    placeholder="0712 345 678"
                    autocomplete="tel"
                    autofocus
                    [attr.aria-describedby]="error() ? 'phone-hint auth-error' : 'phone-hint'"
                    [attr.aria-invalid]="error() ? 'true' : null"
                    [formControl]="phone"
                  />
                  <span id="phone-hint" class="type-caption mt-1.5"> Use 07… or +254… </span>
                </label>

                @if (error()) {
                  <div id="auth-error" role="alert" class="alert alert-error py-3 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span>{{ error() }}</span>
                  </div>
                }

                <button
                  type="submit"
                  class="btn btn-primary min-h-11 w-full"
                  [disabled]="sending()"
                >
                  @if (sending()) {
                    <span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
                    Sending code
                  } @else {
                    Send code
                    <app-icon name="heroArrowRight" />
                  }
                </button>
              </form>
            } @else {
              <form
                (submit)="$event.preventDefault(); verifyOtp()"
                class="flex flex-col gap-4"
                novalidate
              >
                <div class="surface-inset flex items-start gap-3 p-3 text-sm">
                  <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-base-100 text-primary"
                  >
                    <app-icon name="heroDevicePhoneMobile" />
                  </span>
                  <span class="min-w-0">
                    <span class="block text-base-content/65">Sent by SMS and WhatsApp</span>
                    <strong class="mt-0.5 block truncate font-semibold tabular-nums">{{
                      phoneE164()
                    }}</strong>
                  </span>
                </div>

                <label class="form-control" for="otp-code">
                  <span class="label-text mb-1">6-digit code</span>
                  <input
                    id="otp-code"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    class="input input-bordered min-h-11 w-full text-center font-semibold tracking-widest tabular-nums"
                    placeholder="123456"
                    maxlength="6"
                    autocomplete="one-time-code"
                    autofocus
                    [attr.aria-describedby]="error() ? 'otp-hint auth-error' : 'otp-hint'"
                    [attr.aria-invalid]="error() ? 'true' : null"
                    [formControl]="otp"
                  />
                  <span id="otp-hint" class="type-caption mt-1.5">
                    It may take a moment to arrive.
                  </span>
                </label>

                @if (error()) {
                  <div id="auth-error" role="alert" class="alert alert-error py-3 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span>{{ error() }}</span>
                  </div>
                }

                <button
                  type="submit"
                  class="btn btn-primary min-h-11 w-full"
                  [disabled]="sending()"
                >
                  @if (sending()) {
                    <span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
                    Checking code
                  } @else {
                    Verify and continue
                    <app-icon name="heroArrowRight" />
                  }
                </button>

                <div
                  class="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-2"
                >
                  <button type="button" class="btn btn-ghost btn-sm min-h-11" (click)="editPhone()">
                    Change number
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm min-h-11"
                    [disabled]="cooldown() > 0"
                    (click)="sendOtp()"
                  >
                    {{ cooldown() > 0 ? 'Resend in ' + cooldown() + 's' : 'Resend code' }}
                  </button>
                </div>
              </form>
            }
          </div>

          <div class="text-center">
            <nav class="flex items-center justify-center gap-1" aria-label="Legal policies">
              <a [href]="siteUrl('/terms')" class="btn btn-ghost btn-xs min-h-11 font-medium"
                >Terms</a
              >
              <span class="type-caption" aria-hidden="true">·</span>
              <a [href]="siteUrl('/privacy')" class="btn btn-ghost btn-xs min-h-11 font-medium"
                >Privacy Policy</a
              >
            </nav>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class LoginComponent {
  protected readonly siteUrl = siteUrl;
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
  private readonly requestedBlogRef = this.route.snapshot.queryParamMap.get('blog_ref');
  private readonly requestedSalesCode = this.route.snapshot.queryParamMap.get('sales_code');
  private readonly registrationIntent = hasRegistrationIntent(this.route.snapshot.queryParamMap);

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
    const token = this.otp.value.trim();
    if (!/^\d{6}$/.test(token)) {
      this.error.set('Enter the complete 6-digit code.');
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.client.auth.verifyOtp({
        phone: this.phoneE164(),
        token,
        type: 'sms',
      });
      if (error) throw error;
      // Claim a phone invitation before issuing the refreshed token. The RPC
      // verifies the authenticated user's confirmed phone and never trusts a
      // company or phone supplied by the browser.
      await this.supabase.claimTeamInvitations();
      // OTP-issued tokens lack the custom claims (company_id, user_role);
      // refresh so permission-gated RPCs (settle/void/override) work.
      const { error: refreshError } = await this.supabase.client.auth.refreshSession();
      if (refreshError) throw refreshError;
      const hasCompanyClaim = Boolean(this.supabase.claims()?.company_id);
      if (hasCompanyClaim) {
        await this.router.navigate(['/dashboard']);
        return;
      }

      let target = this.registrationIntent ? '/register' : '/access-required';
      try {
        const legalStatus = await this.legal.refresh();
        if (legalStatus.company_status === 'unapproved') target = '/company/pending';
      } catch {
        // Registration and invitation claiming remain explicit even if the
        // optional legal-status lookup is temporarily unavailable.
      }
      await this.router.navigate([target], {
        queryParams:
          target === '/register'
            ? {
                blog_ref: this.requestedBlogRef ?? undefined,
                sales_code: this.requestedSalesCode ?? undefined,
              }
            : undefined,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      this.sending.set(false);
    }
  }

  protected editPhone(): void {
    this.step.set('phone');
    this.otp.setValue('');
    this.error.set(null);
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

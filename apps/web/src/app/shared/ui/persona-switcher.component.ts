import { Component, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from '../../core/supabase.service';

interface Persona {
  label: string;
  phone: string;
}

/** Seeded demo personas (supabase/seed.sql + [auth.sms.test_otp]). */
const PERSONAS: Persona[] = [
  { label: 'Admin', phone: '254700000001' },
  { label: 'Cashier', phone: '254700000002' },
  { label: 'Manager', phone: '254700000003' },
];

const TEST_OTP = '123456';

const LOCAL_SUPABASE = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/;

/**
 * Dev-only persona switcher: one-click sign-in as a seeded test user via the
 * fixed test OTP. Renders only in development builds against a local Supabase
 * stack — never against a deployed backend.
 */
@Component({
  selector: 'app-persona-switcher',
  template: `
    @if (enabled) {
      <div class="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2 lg:bottom-4">
        @if (open()) {
          <div class="card border border-base-300 bg-base-100 p-3 shadow-overlay">
            <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-base-content/40">
              Dev personas
            </div>
            <div class="flex flex-col gap-1.5">
              @for (persona of personas; track persona.phone) {
                <button
                  type="button"
                  class="btn btn-outline btn-sm justify-start"
                  [disabled]="switching()"
                  (click)="switchTo(persona)"
                >
                  {{ persona.label }}
                  <span class="text-xs text-base-content/50">{{ persona.phone }}</span>
                </button>
              }
            </div>
            @if (error()) {
              <p class="mt-2 text-xs text-error">{{ error() }}</p>
            }
          </div>
        }
        <button
          type="button"
          class="btn btn-warning btn-sm"
          title="Switch dev persona"
          aria-label="Switch dev persona"
          (click)="open.set(!open())"
        >
          Dev
        </button>
      </div>
    }
  `,
})
export class PersonaSwitcherComponent {
  private readonly supabase = inject(SupabaseService);

  /** Development build AND local Supabase — never shown against a deployed backend. */
  protected readonly enabled =
    !environment.production && LOCAL_SUPABASE.test(environment.supabaseUrl);

  protected readonly personas = PERSONAS;
  protected readonly open = signal(false);
  protected readonly switching = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async switchTo(persona: Persona): Promise<void> {
    this.switching.set(true);
    this.error.set(null);
    try {
      // Clear any active session first; gotrue-js behavior when calling
      // signInWithOtp over an existing session varies.
      await this.supabase.client.auth.signOut();
      const { error: otpError } = await this.supabase.client.auth.signInWithOtp({
        phone: persona.phone,
      });
      if (otpError) throw otpError;
      const { error: verifyError } = await this.supabase.client.auth.verifyOtp({
        phone: persona.phone,
        token: TEST_OTP,
        type: 'sms',
      });
      if (verifyError) throw verifyError;
      // OTP-issued tokens lack custom claims; refresh, then reload so every
      // service re-reads permissions/company state for the new persona.
      await this.supabase.client.auth.refreshSession();
      window.location.assign('/dashboard');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Switch failed');
      this.switching.set(false);
    }
  }
}

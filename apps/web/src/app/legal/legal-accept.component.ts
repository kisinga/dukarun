import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';
import { CompanyLegalStatus, LegalService } from './legal.service';

@Component({
  selector: 'app-legal-accept',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-screen items-center justify-center bg-base-200 p-4">
      <section class="card w-full max-w-xl bg-base-100">
        <div class="card-body gap-5">
          @if (status(); as current) {
            <div>
              <p class="type-caption uppercase tracking-wider">Company agreement</p>
              <h1 class="type-title mt-1">Review the current Terms</h1>
              <p class="mt-2 text-sm text-base-content/70">
                An authorized company administrator must accept version {{ current.version }} before
                the team can continue.
              </p>
            </div>

            <div class="rounded-box border border-base-300 bg-base-200/40 p-4 text-sm">
              <p class="font-semibold">Terms of Service</p>
              <p class="mt-1 text-base-content/70">
                Read the complete published Terms before accepting for your company.
              </p>
              <div class="mt-3 flex flex-wrap gap-3">
                <a
                  routerLink="/terms"
                  [queryParams]="{ version: current.version }"
                  target="_blank"
                  class="link link-primary"
                  >Read Terms version {{ current.version }}</a
                >
                <a routerLink="/privacy" target="_blank" class="link link-primary"
                  >Read Privacy Notice</a
                >
                <a routerLink="/dpa" target="_blank" class="link link-primary">Read DPA</a>
              </div>
            </div>

            <label
              class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-4"
            >
              <input
                type="checkbox"
                class="checkbox checkbox-primary mt-0.5"
                [formControl]="agreed"
              />
              <span class="text-sm">
                I confirm that I am authorized to bind this company and agree to the Terms of
                Service. The Privacy Notice explains how personal data is handled and is not a
                request for marketing consent.
              </span>
            </label>

            <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" class="btn btn-ghost" (click)="signOut()">Sign out</button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="agreed.invalid || saving()"
                (click)="accept()"
              >
                {{ saving() ? 'Recording acceptance…' : 'Accept and continue' }}
              </button>
            </div>
          } @else if (!error()) {
            <span
              class="loading loading-spinner self-center"
              aria-label="Loading current Terms"
            ></span>
          }
          @if (error()) {
            <p class="text-sm text-error" role="alert">{{ error() }}</p>
          }
        </div>
      </section>
    </main>
  `,
})
export class LegalAcceptComponent implements OnInit {
  private readonly legal = inject(LegalService);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly status = signal<CompanyLegalStatus | null>(null);
  protected readonly agreed = new FormControl(false, {
    nonNullable: true,
    validators: [Validators.requiredTrue],
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const status = await this.legal.refresh();
      if (!status.required || status.accepted) {
        await this.router.navigateByUrl(
          this.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'))
        );
        return;
      }
      this.status.set(status);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Current Terms could not be loaded.');
    }
  }

  protected async accept(): Promise<void> {
    const status = this.status();
    if (!status || this.agreed.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.legal.acceptCurrentTerms(status);
      const returnUrl = this.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Acceptance could not be recorded');
    } finally {
      this.saving.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigate(['/login']);
  }

  private safeReturnUrl(value: string | null): string {
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
  }
}

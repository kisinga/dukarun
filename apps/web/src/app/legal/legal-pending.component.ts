import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CompanyContextService } from '../core/company-context.service';
import { SupabaseService } from '../core/supabase.service';
import { LegalService } from './legal.service';
import { siteUrl } from '../core/public-url';

@Component({
  selector: 'app-legal-pending',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-screen items-center justify-center bg-base-200 p-4">
      <section class="card w-full max-w-lg bg-base-100">
        <div class="card-body gap-5 text-center">
          <div>
            <h1 class="type-title">
              {{
                approvalPending() ? 'Company approval is pending' : 'Company Terms need attention'
              }}
            </h1>
            <p class="mt-2 text-sm text-base-content/70">
              @if (approvalPending()) {
                Your workspace has been created. A platform administrator must approve it before the
                team can continue.
              } @else if (offline()) {
                We cannot confirm this company's acceptance while this device is offline. Reconnect
                and try again.
              } @else {
                Ask a company administrator with team-management access to review and accept the
                current Terms.
              }
            </p>
          </div>

          @if (error()) {
            <p class="text-sm text-error" role="alert">{{ error() }}</p>
          }

          @if (companies.isMultiCompany()) {
            <label class="form-control text-left">
              <span class="label-text mb-1">Switch company</span>
              <select class="select select-bordered" (change)="switchCompany($event)">
                @for (company of companies.companies(); track company.company_id) {
                  <option
                    [value]="company.company_id"
                    [selected]="company.is_active"
                    [disabled]="company.status !== 'approved'"
                  >
                    {{
                      company.name + (company.status === 'unapproved' ? ' — Pending approval' : '')
                    }}
                  </option>
                }
              </select>
            </label>
          }

          <div class="flex flex-col gap-2 sm:flex-row sm:justify-center">
            @if (!approvalPending()) {
              <a [href]="siteUrl('/terms')" target="_blank" class="btn btn-ghost">Read Terms</a>
            }
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="checking()"
              (click)="checkAgain()"
            >
              {{ checking() ? 'Checking…' : 'Check again' }}
            </button>
            <button type="button" class="btn btn-outline" (click)="signOut()">Sign out</button>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class LegalPendingComponent implements OnInit {
  protected readonly siteUrl = siteUrl;
  private readonly legal = inject(LegalService);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly companies = inject(CompanyContextService);
  protected readonly checking = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly offline = signal(this.route.snapshot.queryParamMap.has('offline'));
  protected readonly approvalPending = signal(false);

  ngOnInit(): void {
    void this.companies
      .load()
      .catch(() => this.error.set('Companies could not be loaded. Try again.'));
    void this.checkAgain(false);
  }

  protected async checkAgain(showPendingError = true): Promise<void> {
    this.checking.set(true);
    this.error.set(null);
    try {
      const status = await this.legal.refresh();
      this.approvalPending.set(status.company_status === 'unapproved');
      if (this.approvalPending()) {
        if (showPendingError) this.error.set('Company approval is still pending.');
      } else if (!status.required || status.accepted || !status.enforcement_started) {
        await this.router.navigateByUrl(this.safeReturnUrl());
      } else if (status.can_accept) {
        await this.router.navigate(['/legal/accept'], {
          queryParams: { returnUrl: this.safeReturnUrl() },
        });
      } else {
        this.error.set('Acceptance is still pending.');
      }
    } catch {
      this.offline.set(!navigator.onLine);
      this.error.set('Legal status could not be verified.');
    } finally {
      this.checking.set(false);
    }
  }

  protected switchCompany(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) void this.companies.switchCompany(id).catch(error => this.error.set(String(error)));
  }

  protected async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigate(['/login']);
  }

  private safeReturnUrl(): string {
    const value = this.route.snapshot.queryParamMap.get('returnUrl');
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
  }
}

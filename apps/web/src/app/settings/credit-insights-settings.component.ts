import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { InsightsService } from '../insights/insights.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { CompanySettingsStore } from './company-settings.store';
import type { CompanySettings } from './settings.service';

@Component({
  selector: 'app-credit-insights-settings',
  imports: [ReactiveFormsModule, ButtonComponent],
  template: `
    <div class="card bg-base-100">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="section-title">Credit insights</h2>
            <p class="type-caption mt-1">
              Control internal opportunity-cost illustrations and customer band-change notices.
            </p>
          </div>
          @if (dirty()) {
            <span class="badge badge-warning badge-sm">Unsaved changes</span>
          }
        </div>

        <form class="mt-1" (submit)="$event.preventDefault(); save()">
          <div class="divide-y divide-base-300">
            <div class="grid grid-cols-[1fr_auto] items-center gap-4 py-3">
              <span>
                <span class="block text-sm font-medium">Illustrative annual rate</span>
                <span class="block text-xs text-base-content/60">
                  Internal only. This never changes balances, statements or ledger entries.
                </span>
              </span>
              <label class="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  class="input input-bordered input-sm w-24 text-right"
                  aria-label="Illustrative annual percentage rate"
                  [formControl]="annualRate"
                />
                <span class="text-xs text-base-content/60">%</span>
              </label>
            </div>

            <label class="flex cursor-pointer items-center justify-between gap-4 py-3">
              <span>
                <span class="block text-sm font-medium">Customer credit score notices</span>
                <span class="block text-xs text-base-content/60">
                  Notify eligible, opted-in customers only when their displayed band changes.
                </span>
              </span>
              <input type="checkbox" class="toggle toggle-primary" [formControl]="notifications" />
            </label>
          </div>

          @if (dirty()) {
            <div class="mt-3 flex justify-end gap-2 border-t border-base-300/60 pt-3">
              <button
                appButton
                variant="ghost"
                type="button"
                [disabled]="busy()"
                (click)="discard()"
              >
                Discard
              </button>
              <button appButton type="submit" [loading]="busy()" [disabled]="annualRate.invalid">
                Save changes
              </button>
            </div>
          }
        </form>

        @if (message(); as message) {
          <p
            class="mt-2 text-sm"
            [class.text-success]="message.ok"
            [class.text-error]="!message.ok"
          >
            {{ message.text }}
          </p>
        }
      </div>
    </div>
  `,
})
export class CreditInsightsSettingsComponent implements OnInit {
  private readonly companySettings = inject(CompanySettingsStore);
  private readonly insights = inject(InsightsService);

  protected readonly annualRate = new FormControl(18, {
    nonNullable: true,
    validators: [Validators.min(0), Validators.max(100)],
  });
  protected readonly notifications = new FormControl(true, { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);

  async ngOnInit(): Promise<void> {
    const settings = this.companySettings.settings() ?? (await this.companySettings.load());
    this.applySettings(settings);
  }

  protected dirty(): boolean {
    return this.annualRate.dirty || this.notifications.dirty;
  }

  protected discard(): void {
    const settings = this.companySettings.settings();
    if (settings) this.applySettings(settings);
    this.message.set(null);
  }

  protected async save(): Promise<void> {
    if (this.annualRate.invalid) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const rateBps = Math.round(this.annualRate.value * 100);
      await this.insights.updateCreditSettings(rateBps, this.notifications.value);
      this.companySettings.patchLocal({
        credit_opportunity_rate_bps: rateBps,
        credit_score_notifications_enabled: this.notifications.value,
      });
      this.applySettings(this.companySettings.settings()!);
      this.message.set({ ok: true, text: 'Saved' });
    } catch (error) {
      this.message.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Save failed',
      });
    } finally {
      this.busy.set(false);
    }
  }

  private applySettings(settings: CompanySettings): void {
    this.annualRate.setValue(settings.credit_opportunity_rate_bps / 100);
    this.notifications.setValue(settings.credit_score_notifications_enabled);
    this.annualRate.markAsPristine();
    this.notifications.markAsPristine();
  }
}

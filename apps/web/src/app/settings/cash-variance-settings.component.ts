import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKesInput, parseKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { CompanySettingsStore } from './company-settings.store';
import type { CompanySettings } from './settings.service';

@Component({
  selector: 'app-cash-variance-settings',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
  ],
  template: `
    @if (settings(); as s) {
      <details class="group card bg-base-100">
        <summary class="card-body cursor-pointer list-none p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="section-title">Cash variance alerts</h2>
              <p class="type-caption mt-1">
                Flag drawer variances from
                <app-money [amount]="s.variance_notification_threshold" [showCurrency]="true" />.
              </p>
            </div>
            <div class="flex items-center gap-2">
              @if (dirty()) {
                <span class="badge badge-warning badge-sm">Unsaved</span>
              } @else {
                <span class="badge badge-ghost badge-sm">Cash control</span>
              }
              <app-icon
                name="heroChevronDown"
                class="text-base-content/50 transition group-open:rotate-180"
              />
            </div>
          </div>
        </summary>
        <div class="card-body border-t border-base-300/60 p-4 pt-3">
          @if (!s.cash_control_enabled) {
            <p class="type-caption flex items-start gap-1.5 text-info">
              <app-icon name="heroInformationCircle" size="sm" />
              <span>This takes effect when till-session cash control is enabled.</span>
            </p>
          }
          <form
            (submit)="$event.preventDefault(); save()"
            class="mt-3 flex flex-wrap items-end gap-2"
          >
            <app-form-field label="Threshold (KES)" class="w-40">
              <input
                type="text"
                inputmode="numeric"
                class="input input-bordered input-sm w-full"
                [formControl]="varianceThreshold"
              />
            </app-form-field>
            @if (dirty()) {
              <button
                appButton
                variant="ghost"
                type="button"
                [disabled]="busy()"
                (click)="discard()"
              >
                Discard
              </button>
              <button appButton type="submit" [loading]="busy()">Save changes</button>
            }
          </form>
          @if (message(); as m) {
            <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
              {{ m.text }}
            </p>
          }
        </div>
      </details>
    }
  `,
})
export class CashVarianceSettingsComponent implements OnInit {
  private readonly companySettings = inject(CompanySettingsStore);

  protected readonly settings = this.companySettings.settings;
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly varianceThreshold = new FormControl('', { nonNullable: true });

  async ngOnInit(): Promise<void> {
    const settings = await this.companySettings.load();
    this.applySettings(settings);
  }

  protected dirty(): boolean {
    return this.varianceThreshold.dirty;
  }

  protected discard(): void {
    const current = this.settings();
    if (!current) return;
    this.applySettings(current);
    this.message.set(null);
  }

  protected async save(): Promise<void> {
    const amount = parseKes(this.varianceThreshold.value);
    if (amount === null) {
      this.message.set({ ok: false, text: 'Enter a valid threshold amount' });
      return;
    }
    this.busy.set(true);
    try {
      const settings = await this.companySettings.update({
        variance_notification_threshold: amount,
      });
      this.applySettings(settings);
      this.message.set({ ok: true, text: 'Saved' });
    } catch (error) {
      this.message.set({ ok: false, text: error instanceof Error ? error.message : 'Save failed' });
    } finally {
      this.busy.set(false);
    }
  }

  private applySettings(settings: CompanySettings): void {
    this.varianceThreshold.setValue(formatKesInput(settings.variance_notification_threshold));
    this.varianceThreshold.markAsPristine();
  }
}

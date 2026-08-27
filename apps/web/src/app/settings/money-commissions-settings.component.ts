import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../core/entitlements.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { CompanySettingsStore } from './company-settings.store';
import { SettingsService } from './settings.service';

@Component({
  selector: 'app-money-commissions-settings',
  imports: [RouterLink, ButtonComponent],
  template: `
    @if (settings(); as s) {
      <div class="card bg-base-100">
        <div class="card-body p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="section-title">Commissions</h2>
              <p class="type-caption mt-1">
                Optional staff commission plans and reviewable statements.
              </p>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              @if (s.commissions_enabled) {
                <a appButton variant="ghost" size="sm" routerLink="/team/commissions">
                  Manage commissions
                </a>
              }
              <label class="label cursor-pointer gap-3">
                <span class="label-text font-medium">Enable commissions</span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary"
                  [checked]="s.commissions_enabled"
                  [disabled]="busy()"
                  (change)="toggleCommissions($event)"
                />
              </label>
            </div>
          </div>
          @if (message(); as m) {
            <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
              {{ m.text }}
            </p>
          }
        </div>
      </div>
    }
  `,
})
export class MoneyCommissionsSettingsComponent {
  private readonly companySettings = inject(CompanySettingsStore);
  private readonly settingsService = inject(SettingsService);
  private readonly entitlements = inject(EntitlementsService);

  protected readonly settings = this.companySettings.settings;
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);

  protected async toggleCommissions(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    const current = this.settings();
    if (!current) return;
    this.busy.set(true);
    try {
      await this.settingsService.setCommissionsEnabled(enabled);
      this.companySettings.patchLocal({ commissions_enabled: enabled });
      await this.entitlements.refresh();
      this.message.set({
        ok: true,
        text: enabled ? 'Commissions enabled' : 'Commissions disabled',
      });
    } catch (error) {
      (event.target as HTMLInputElement).checked = current.commissions_enabled;
      this.message.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Update failed',
      });
    } finally {
      this.busy.set(false);
    }
  }
}

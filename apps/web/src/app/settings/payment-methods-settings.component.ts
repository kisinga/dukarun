import { Component, inject } from '@angular/core';
import { reconciliationLabel } from '../core/payment-methods';
import { IconComponent } from '../shared/ui/icon.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { MoneySettingsStore, type PaymentMethodToggleField } from './money-settings.store';
import type { PaymentMethodRow } from './settings.service';

@Component({
  selector: 'app-payment-methods-settings',
  imports: [IconComponent, MobileListComponent],
  template: `
    @if (!money.loading() && !money.error()) {
      <details class="group card bg-base-100">
        <summary class="card-body cursor-pointer list-none p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="section-title">Accepted payment methods</h2>
              <p class="type-caption mt-1">
                Cashier buttons, reconciliation rules and location availability.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge badge-ghost badge-sm">
                {{ money.paymentMethods().length }} methods
              </span>
              <app-icon
                name="heroChevronDown"
                class="text-base-content/50 transition group-open:rotate-180"
              />
            </div>
          </div>
        </summary>
        <div class="card-body border-t border-base-300/60 p-4">
          <app-mobile-list class="mt-3">
            @for (pm of money.paymentMethods(); track pm.code) {
              <div mobileListRow class="p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate font-semibold">{{ pm.name }}</p>
                    <p class="type-caption mt-1">
                      {{ pm.code }} · {{ reconciliationLabel(pm.reconciliation_type) }}
                    </p>
                  </div>
                  @if (money.locations().length > 1) {
                    <details class="dropdown dropdown-end shrink-0">
                      <summary class="btn btn-ghost btn-sm min-h-11">
                        {{ money.paymentLocationLabel(pm) }}
                      </summary>
                      <div
                        class="dropdown-content z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-box border border-base-300 bg-base-100 p-2 shadow-overlay"
                      >
                        @for (location of money.locations(); track location.id) {
                          <label class="label min-h-11 cursor-pointer justify-start gap-2">
                            <input
                              type="checkbox"
                              class="checkbox checkbox-sm"
                              [checked]="money.paymentMethodEnabledAt(pm, location.id)"
                              [disabled]="money.busy()"
                              (change)="togglePaymentLocation(pm, location.id, $event)"
                            />
                            <span class="label-text">{{ location.name }}</span>
                          </label>
                        }
                      </div>
                    </details>
                  }
                </div>
                <div class="mt-3 grid grid-cols-3 gap-2 rounded-field bg-base-200/50 p-2">
                  <label class="flex min-h-11 flex-col items-center justify-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      class="toggle toggle-sm"
                      [checked]="pm.enabled"
                      (change)="toggleMethod(pm, 'enabled', $event)"
                      [disabled]="money.busy()"
                    />
                    Enabled
                  </label>
                  <label class="flex min-h-11 flex-col items-center justify-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      class="toggle toggle-sm"
                      [checked]="pm.requires_reconciliation"
                      (change)="toggleMethod(pm, 'requires_reconciliation', $event)"
                      [disabled]="money.busy()"
                    />
                    Reconcile
                  </label>
                  <label class="flex min-h-11 flex-col items-center justify-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      class="toggle toggle-sm"
                      [checked]="pm.is_cashier_controlled"
                      (change)="toggleMethod(pm, 'is_cashier_controlled', $event)"
                      [disabled]="money.busy()"
                    />
                    Cashier
                  </label>
                </div>
              </div>
            }
          </app-mobile-list>
          <div class="hidden lg:block">
            <table class="table table-sm mt-2">
              <thead class="bg-base-200/70 text-xs uppercase text-base-content/60">
                <tr>
                  <th>Method</th>
                  <th>Enabled</th>
                  <th>Reconciliation</th>
                  <th>Cashier</th>
                  <th>Locations</th>
                </tr>
              </thead>
              <tbody>
                @for (pm of money.paymentMethods(); track pm.code) {
                  <tr>
                    <td>
                      <span class="text-sm font-medium">{{ pm.name }}</span>
                      <span class="ml-1 font-mono text-xs text-base-content/60">
                        {{ pm.code }}
                      </span>
                      <p class="type-caption mt-0.5">
                        {{ reconciliationLabel(pm.reconciliation_type) }}
                      </p>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        class="toggle toggle-sm"
                        [checked]="pm.enabled"
                        (change)="toggleMethod(pm, 'enabled', $event)"
                        [disabled]="money.busy()"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        class="toggle toggle-sm"
                        [checked]="pm.requires_reconciliation"
                        (change)="toggleMethod(pm, 'requires_reconciliation', $event)"
                        [disabled]="money.busy()"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        class="toggle toggle-sm"
                        [checked]="pm.is_cashier_controlled"
                        (change)="toggleMethod(pm, 'is_cashier_controlled', $event)"
                        [disabled]="money.busy()"
                      />
                    </td>
                    <td>
                      @if (money.locations().length <= 1) {
                        <span class="type-caption">Main location</span>
                      } @else {
                        <details class="dropdown dropdown-end">
                          <summary class="btn btn-ghost btn-sm min-h-11">
                            {{ money.paymentLocationLabel(pm) }}
                          </summary>
                          <div
                            class="dropdown-content z-20 mt-1 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-overlay"
                          >
                            @for (location of money.locations(); track location.id) {
                              <label class="label min-h-11 cursor-pointer justify-start gap-2">
                                <input
                                  type="checkbox"
                                  class="checkbox checkbox-sm"
                                  [checked]="money.paymentMethodEnabledAt(pm, location.id)"
                                  [disabled]="money.busy()"
                                  (change)="togglePaymentLocation(pm, location.id, $event)"
                                />
                                <span class="label-text">{{ location.name }}</span>
                              </label>
                            }
                          </div>
                        </details>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (money.message(); as m) {
            <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
              {{ m.text }}
            </p>
          }
        </div>
      </details>
    }
  `,
})
export class PaymentMethodsSettingsComponent {
  protected readonly money = inject(MoneySettingsStore);
  protected readonly reconciliationLabel = reconciliationLabel;

  protected async toggleMethod(
    method: PaymentMethodRow,
    field: PaymentMethodToggleField,
    event: Event
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
    const ok = await this.money.toggleMethod(method, field, checked);
    if (!ok) input.checked = !checked;
  }

  protected async togglePaymentLocation(
    method: PaymentMethodRow,
    locationId: string,
    event: Event
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
    const ok = await this.money.togglePaymentLocation(method, locationId, checked);
    if (!ok) input.checked = !checked;
  }
}

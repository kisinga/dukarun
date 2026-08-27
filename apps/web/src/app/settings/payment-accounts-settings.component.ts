import { Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PermissionsService } from '../core/permissions.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { TaskDialogComponent } from '../shared/ui/task-dialog.component';
import { MoneySettingsStore } from './money-settings.store';
import { MpesaSettingsComponent } from './mpesa-settings.component';

@Component({
  selector: 'app-payment-accounts-settings',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MobileListComponent,
    StatusBadgeComponent,
    TaskDialogComponent,
    MpesaSettingsComponent,
  ],
  template: `
    <div class="card bg-base-100">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="section-title">Payment accounts</h2>
            <p class="type-caption mt-1">
              Bank accounts are checkout defaults. Each M-PESA Till connects to one M-PESA money
              account.
            </p>
          </div>
          <div class="flex gap-2">
            <button
              appButton
              variant="outline"
              size="sm"
              type="button"
              (click)="money.startMoneyAccount('mpesa')"
            >
              Add M-PESA
            </button>
            <button
              appButton
              variant="outline"
              size="sm"
              type="button"
              (click)="money.startMoneyAccount('bank')"
            >
              Add bank
            </button>
          </div>
        </div>

        @if (money.addingMoneyKind() || money.editingMoneyAccount()) {
          <form
            class="mt-4 rounded-box border border-base-300 bg-base-200/30 p-3"
            (submit)="$event.preventDefault(); money.saveMoneyAccount()"
          >
            <div class="grid gap-3 lg:grid-cols-[12rem_minmax(18rem,28rem)_auto] lg:items-end">
              <div>
                <p class="text-sm font-semibold">
                  {{
                    money.editingMoneyAccount()
                      ? 'Rename account'
                      : 'Add ' + money.moneyKindLabel(money.addingMoneyKind()!) + ' account'
                  }}
                </p>
                <p class="type-caption mt-1">Shown at checkout and in reconciliation.</p>
              </div>
              <app-form-field
                label="Display name"
                hint="Example: Bank - Main, Equity Westlands or Till 123456."
              >
                <input
                  class="input input-bordered min-h-11 w-full"
                  [placeholder]="
                    money.editingMoneyAccount()?.name ??
                    (money.addingMoneyKind() === 'bank' ? 'Bank - Main' : 'M-Pesa Till')
                  "
                  [formControl]="money.moneyAccountName"
                  maxlength="100"
                />
              </app-form-field>
              <div class="flex justify-end gap-2 lg:justify-start">
                <button
                  appButton
                  variant="ghost"
                  type="button"
                  (click)="money.cancelMoneyAccountEdit()"
                >
                  Cancel
                </button>
                <button
                  appButton
                  type="submit"
                  [loading]="money.busy()"
                  [disabled]="money.moneyAccountName.invalid"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        }

        @if (money.loading()) {
          <div class="mt-4 grid gap-2" aria-label="Loading payment accounts">
            <div class="skeleton h-14 w-full"></div>
            <div class="skeleton h-14 w-full"></div>
          </div>
        } @else if (money.error()) {
          <div class="alert alert-error mt-4 text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span class="flex-1">{{ money.error() }}</span>
            <button appButton variant="ghost" size="sm" type="button" (click)="money.load(true)">
              Retry
            </button>
          </div>
        } @else {
          <app-mobile-list class="mt-4">
            @for (account of money.moneyAccountsList(); track account.id) {
              <div class="border-b border-base-300/60 p-3 last:border-b-0">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="badge badge-neutral badge-sm">
                        {{ money.moneyAccountTypeLabel(account) }}
                      </span>
                      @if (!account.is_active) {
                        <span class="badge badge-ghost badge-sm">Archived</span>
                      }
                    </div>
                    <p
                      class="mt-2 truncate text-sm font-semibold"
                      [class.text-base-content/50]="!account.is_active"
                    >
                      {{ account.name }}
                    </p>
                    <p class="type-caption mt-0.5 font-mono">{{ account.code }}</p>
                  </div>
                  @if (account.money_account_kind === 'mpesa') {
                    @if (money.mpesaSetupState(account); as state) {
                      <app-status-badge
                        [type]="money.mpesaSetupStatusType(state.status)"
                        [label]="state.label"
                      />
                    }
                  }
                </div>
                <div class="mt-3 grid gap-2 text-xs text-base-content/65">
                  <div class="flex items-center justify-between gap-3">
                    <span>Checkout default</span>
                    <span class="text-right">
                      {{
                        account.is_active ? money.defaultLocationLabel(account.code) : 'Not used'
                      }}
                    </span>
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap justify-end gap-1">
                  @if (
                    account.money_account_kind === 'mpesa' && perms.has('ManageMpesaIntegration')
                  ) {
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      type="button"
                      [disabled]="!account.is_active"
                      (click)="money.openMpesaSetup(account.code)"
                    >
                      <app-icon name="heroCog6Tooth" />
                      {{ money.mpesaSetupButtonLabel(account) }}
                    </button>
                  }
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    (click)="money.editMoneyAccount(account)"
                  >
                    Rename
                  </button>
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    [disabled]="money.busy()"
                    (click)="money.toggleMoneyAccount(account)"
                  >
                    {{ account.is_active ? 'Archive' : 'Restore' }}
                  </button>
                </div>
              </div>
            } @empty {
              <p class="type-caption p-3">No payment accounts yet.</p>
            }
          </app-mobile-list>

          <div class="mt-4 hidden overflow-x-auto rounded-box border border-base-300/70 lg:block">
            <table class="table table-sm">
              <thead class="bg-base-200/70 text-xs uppercase text-base-content/60">
                <tr>
                  <th>Type</th>
                  <th>Account</th>
                  <th>Checkout default</th>
                  <th>Connection</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (account of money.moneyAccountsList(); track account.id) {
                  <tr [class.table-row-active]="money.mpesaSetupAccountCode() === account.code">
                    <td class="whitespace-nowrap">
                      <span class="badge badge-neutral badge-sm">
                        {{ money.moneyAccountTypeLabel(account) }}
                      </span>
                      @if (!account.is_active) {
                        <span class="badge badge-ghost badge-sm ml-1">Archived</span>
                      }
                    </td>
                    <td class="min-w-48">
                      <p
                        class="truncate font-medium"
                        [class.text-base-content/50]="!account.is_active"
                      >
                        {{ account.name }}
                      </p>
                      <p class="type-caption font-mono">{{ account.code }}</p>
                    </td>
                    <td class="min-w-44 type-caption">
                      {{
                        account.is_active ? money.defaultLocationLabel(account.code) : 'Not used'
                      }}
                    </td>
                    <td class="min-w-36">
                      @if (account.money_account_kind === 'mpesa') {
                        @if (money.mpesaSetupState(account); as state) {
                          <app-status-badge
                            [type]="money.mpesaSetupStatusType(state.status)"
                            [label]="state.label"
                          />
                        }
                      } @else {
                        <span class="type-caption">-</span>
                      }
                    </td>
                    <td class="whitespace-nowrap text-right">
                      <div class="inline-flex items-center gap-1">
                        @if (
                          account.money_account_kind === 'mpesa' &&
                          perms.has('ManageMpesaIntegration')
                        ) {
                          <button
                            appButton
                            variant="outline"
                            size="sm"
                            type="button"
                            [disabled]="!account.is_active"
                            (click)="money.openMpesaSetup(account.code)"
                          >
                            <app-icon name="heroCog6Tooth" />
                            {{ money.mpesaSetupButtonLabel(account) }}
                          </button>
                        }
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          (click)="money.editMoneyAccount(account)"
                        >
                          Rename
                        </button>
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          [disabled]="money.busy()"
                          (click)="money.toggleMoneyAccount(account)"
                        >
                          {{ account.is_active ? 'Archive' : 'Restore' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="type-caption">No payment accounts yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (money.selectedMpesaSetupAccount(); as account) {
          <app-task-dialog
            [open]="money.mpesaSetupOpen()"
            title="Connect M-PESA"
            [subtitle]="account.name"
            size="lg"
            (closed)="money.closeMpesaSetup()"
          >
            <app-mpesa-settings
              [embedded]="true"
              [accountCode]="account.code"
              [accountName]="account.name"
              [checkoutLocationNames]="money.mpesaSetupLocationNames(account.code)"
              (statusChanged)="money.refreshMoneyAccounts()"
            />
            <button
              taskFooter
              appButton
              variant="ghost"
              type="button"
              class="w-full"
              (click)="money.closeMpesaSetup()"
            >
              Close
            </button>
          </app-task-dialog>
        }

        <details class="group mt-5 border-t border-base-300/60 pt-4">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <h3 class="type-heading">Checkout defaults by location</h3>
              <p class="type-caption mt-1">Preselected accounts for each checkout location.</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge badge-ghost badge-sm">
                {{ money.locations().length }} locations
              </span>
              <app-icon
                name="heroChevronDown"
                class="text-base-content/50 transition group-open:rotate-180"
              />
            </div>
          </summary>
          <div class="mt-3 grid gap-3">
            @for (location of money.locations(); track location.id) {
              <div
                class="grid items-center gap-3 rounded-box bg-base-200/50 p-3 sm:grid-cols-[minmax(8rem,1fr)_1fr_1fr]"
              >
                <p class="font-medium">{{ location.name }}</p>
                @for (kind of money.moneyAccountKinds; track kind) {
                  <app-form-field [label]="money.moneyKindLabel(kind)">
                    <select
                      class="select select-bordered min-h-11 w-full"
                      [ngModel]="money.locationDefaultCode(location.id, kind)"
                      [ngModelOptions]="{ standalone: true }"
                      [disabled]="money.busy() || money.activeMoneyAccounts(kind).length === 0"
                      (ngModelChange)="money.setLocationDefault(location.id, kind, $event)"
                    >
                      @for (account of money.activeMoneyAccounts(kind); track account.id) {
                        <option [value]="account.code">{{ account.name }}</option>
                      }
                    </select>
                  </app-form-field>
                }
              </div>
            }
          </div>
        </details>

        @if (money.message(); as message) {
          <p
            class="mt-3 text-sm"
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
export class PaymentAccountsSettingsComponent {
  protected readonly money = inject(MoneySettingsStore);
  protected readonly perms = inject(PermissionsService);
}

import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { IconComponent } from '../shared/ui/icon.component';
import { StatusBadgeComponent, type BadgeType } from '../shared/ui/status-badge.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { LocationContextService } from '../core/location-context.service';
import { PermissionsService } from '../core/permissions.service';
import { MpesaService } from '../core/mpesa.service';
import {
  FulfillmentService,
  type CashHolding,
  type CashRemittance,
  type FulfillmentAssignee,
  type FulfillmentBoardRow,
  type FulfillmentDetail,
  type FulfillmentSettings,
  type FulfillmentStatus,
  type PendingCodSplit,
} from './fulfillment.service';

const STATUSES: FulfillmentStatus[] = ['pending', 'processing', 'ready', 'in_transit', 'failed'];

type FulfillmentAction =
  'accept' | 'reject' | 'shortage' | 'pin_override' | 'failure' | 'cancel_fulfillment';

@Component({
  selector: 'app-fulfillment',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    PageLayoutComponent,
    DrawerComponent,
    IconComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  template: `
    <app-page title="Pickup & Delivery" [workspace]="true" [badge]="activeRows().length">
      @if (locationSettings(); as settings) {
        @if (!settings.feature_available) {
          <app-empty-state
            icon="heroMapPin"
            title="Pickup & delivery is not included"
            description="This feature is not available on the current plan."
            [embedded]="true"
          />
        } @else if (!settings.enabled) {
          <app-empty-state
            icon="heroMapPin"
            title="Pickup & delivery is off here"
            [description]="
              'Turn it on for ' +
              (locations.active()?.name ?? 'this location') +
              ' before creating pickup or delivery orders.'
            "
            [ctaLabel]="canConfigure() ? 'Open settings' : undefined"
            [embedded]="true"
            (ctaClick)="openSettings()"
          />
        } @else {
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" class="tabs tabs-boxed h-10">
              @if (canProcess() || canComplete()) {
                <button
                  role="tab"
                  class="tab min-h-11"
                  [class.tab-active]="tab() === 'board'"
                  (click)="selectTab('board')"
                >
                  Board
                </button>
              }
              @if (canComplete()) {
                <button
                  role="tab"
                  class="tab min-h-11"
                  [class.tab-active]="tab() === 'mine'"
                  (click)="selectTab('mine')"
                >
                  Mine
                </button>
              }
              @if (canComplete() || canSettle()) {
                <button
                  role="tab"
                  class="tab min-h-11"
                  [class.tab-active]="tab() === 'cash'"
                  (click)="selectTab('cash')"
                >
                  Cash handoff
                </button>
              }
            </div>
            <button
              type="button"
              class="btn btn-square btn-ghost btn-sm"
              title="Refresh"
              aria-label="Refresh pickup and delivery orders"
              [disabled]="loading()"
              (click)="load()"
            >
              <app-icon name="heroArrowPath" [class.animate-spin]="loading()" />
            </button>
          </div>

          @if (error()) {
            <div class="alert alert-error mb-4 text-sm" role="alert">{{ error() }}</div>
          }
          @if (notice()) {
            <div class="alert alert-success mb-4 text-sm" role="status">{{ notice() }}</div>
          }

          @if (tab() === 'cash') {
            <section class="grid gap-6" [class.xl:grid-cols-2]="canComplete()">
              @if (canComplete()) {
                <div>
                  <div class="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <h2 class="type-heading">Cash in your custody</h2>
                      <p class="type-caption">Select settled COD cash to hand to the cashier.</p>
                    </div>
                    <button
                      class="btn btn-primary btn-sm"
                      type="button"
                      [disabled]="selectedHoldingIds().size === 0 || busy()"
                      (click)="submitHandoff()"
                    >
                      <app-icon name="heroArrowRight" />
                      Submit {{ selectedHoldingIds().size || '' }}
                    </button>
                  </div>
                  <div class="overflow-hidden border-y border-base-300 bg-base-100">
                    @for (holding of holdings(); track holding.payment_id) {
                      <label
                        class="flex min-h-14 cursor-pointer items-center gap-3 border-b border-base-200 px-3 py-2 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [checked]="selectedHoldingIds().has(holding.payment_id)"
                          (change)="toggleHolding(holding.payment_id)"
                        />
                        <span class="min-w-0 flex-1">
                          <span class="block font-medium">{{ holding.order_code }}</span>
                          <span class="type-caption">{{ dateTime(holding.collected_at) }}</span>
                        </span>
                        <strong>KES {{ money(holding.amount) }}</strong>
                      </label>
                    } @empty {
                      <app-empty-state
                        icon="heroBanknotes"
                        title="No cash waiting"
                        description="No unsettled COD cash."
                        [embedded]="true"
                      />
                    }
                  </div>
                </div>
              }

              <div>
                <h2 class="type-heading mb-3">Recent handoffs</h2>
                <div class="space-y-2">
                  @for (remittance of remittances(); track remittance.id) {
                    <article class="border-b border-base-300 bg-base-100 px-3 py-3 first:border-t">
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <div class="font-medium">{{ remittance.custodian_name }}</div>
                          <div class="type-caption">
                            {{ remittance.payment_count }} payments ·
                            {{ dateTime(remittance.submitted_at) }}
                          </div>
                        </div>
                        <div class="text-right">
                          <strong>KES {{ money(remittance.expected_amount) }}</strong>
                          <app-status-badge
                            class="mt-1 block"
                            [label]="statusLabel(remittance.status)"
                            [type]="statusTone(remittance.status)"
                          />
                        </div>
                      </div>
                      @if (remittance.status === 'submitted' && canSettle()) {
                        <div class="mt-3 flex justify-end gap-2">
                          <button
                            class="btn btn-ghost btn-sm"
                            type="button"
                            (click)="openRemittanceAction('reject', remittance)"
                          >
                            Reject
                          </button>
                          @if (canReconcile()) {
                            <button
                              class="btn btn-warning btn-sm"
                              type="button"
                              (click)="openRemittanceAction('shortage', remittance)"
                            >
                              Shortage
                            </button>
                          }
                          <button
                            class="btn btn-primary btn-sm"
                            type="button"
                            (click)="openRemittanceAction('accept', remittance)"
                          >
                            Accept exact
                          </button>
                        </div>
                      }
                      @if (remittance.variance_reason) {
                        <p class="mt-2 text-sm text-base-content/65">
                          {{ remittance.variance_reason }}
                        </p>
                      }
                    </article>
                  } @empty {
                    <app-empty-state
                      icon="heroArrowsRightLeft"
                      title="No handoffs yet"
                      description="No cash handoffs at this location."
                      [embedded]="true"
                    />
                  }
                </div>
              </div>
            </section>
          } @else {
            @if (activeRows().length === 0 && !loading()) {
              <app-empty-state
                icon="heroQueueList"
                [title]="tab() === 'mine' ? 'No orders assigned to you' : 'No active orders'"
                [description]="
                  tab() === 'mine'
                    ? 'Claim a ready order from the board when you are ready to handle it.'
                    : 'New pickup and delivery orders will appear here.'
                "
                [embedded]="true"
              />
            } @else {
              <div class="mb-3 flex gap-1 overflow-x-auto md:hidden">
                @for (status of statuses; track status) {
                  <button
                    type="button"
                    class="btn btn-sm whitespace-nowrap"
                    [class.btn-neutral]="mobileStatus() === status"
                    [class.btn-ghost]="mobileStatus() !== status"
                    (click)="mobileStatus.set(status)"
                  >
                    {{ statusLabel(status) }}
                    <span class="badge badge-sm">{{ rowsFor(status).length }}</span>
                  </button>
                }
              </div>

              <section class="hidden min-h-48 grid-cols-5 gap-3 pb-3 md:grid">
                @for (status of statuses; track status) {
                  <div class="min-w-0 border-t-2 pt-2" [class]="columnClass(status)">
                    <header class="mb-2 flex h-8 items-center justify-between px-1">
                      <h2 class="text-sm font-semibold">{{ statusLabel(status) }}</h2>
                      <span class="badge badge-sm badge-ghost">{{ rowsFor(status).length }}</span>
                    </header>
                    <div class="space-y-2">
                      @for (row of rowsFor(status); track row.id) {
                        <button
                          type="button"
                          class="block w-full border border-base-300 bg-base-100 p-3 text-left shadow-sm transition hover:border-base-content/30 hover:shadow"
                          (click)="openDetail(row)"
                        >
                          <ng-container
                            *ngTemplateOutlet="fulfillmentCard; context: { $implicit: row }"
                          />
                        </button>
                      }
                    </div>
                  </div>
                }
              </section>

              <section class="space-y-2 md:hidden">
                @for (row of rowsFor(mobileStatus()); track row.id) {
                  <button
                    type="button"
                    class="block w-full border-y border-base-300 bg-base-100 p-3 text-left"
                    (click)="openDetail(row)"
                  >
                    <ng-container
                      *ngTemplateOutlet="fulfillmentCard; context: { $implicit: row }"
                    />
                  </button>
                } @empty {
                  <app-empty-state
                    icon="heroQueueList"
                    title="Nothing here"
                    description="No orders at this stage."
                    [embedded]="true"
                  />
                }
              </section>
            }

            @if (recentRows().length > 0) {
              <section class="mt-6 border-t border-base-300 pt-4" aria-labelledby="recent-heading">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <h2 id="recent-heading" class="type-heading">Recently completed</h2>
                  <span class="type-caption">Latest {{ recentRows().length }}</span>
                </div>
                <div class="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-4">
                  @for (row of recentRows(); track row.id) {
                    <button
                      type="button"
                      class="flex min-h-14 items-center justify-between gap-3 border-b border-base-300 py-2 text-left"
                      (click)="openDetail(row)"
                    >
                      <span class="min-w-0">
                        <strong class="block truncate text-sm">{{ row.order_code }}</strong>
                        <span class="type-caption">{{ statusLabel(row.fulfillment_type) }}</span>
                      </span>
                      <span class="shrink-0 text-xs text-base-content/55">{{
                        dateTime(row.updated_at)
                      }}</span>
                    </button>
                  }
                </div>
              </section>
            }
          }

          <ng-template #fulfillmentCard let-row>
            <div class="flex items-start justify-between gap-2">
              <strong class="truncate">{{ row.order_code }}</strong>
              <span class="text-xs font-medium uppercase text-base-content/50">{{
                row.fulfillment_type
              }}</span>
            </div>
            <div class="mt-2 space-y-1 text-sm">
              @for (item of row.items.slice(0, 3); track item.name) {
                <div class="flex gap-2">
                  <span class="w-8 shrink-0 text-right text-base-content/50"
                    >{{ item.quantity }}x</span
                  >
                  <span class="min-w-0 truncate">{{ item.name }}</span>
                </div>
              }
            </div>
            <div class="mt-3 flex items-center justify-between gap-2 border-t border-base-200 pt-2">
              <span class="type-caption">{{ dueLabel(row.promised_at) }}</span>
              @if (row.collection_kind === 'cod') {
                <span class="badge badge-warning badge-sm">COD</span>
              }
            </div>
          </ng-template>

          <app-drawer
            [open]="selectedId() !== null"
            [title]="detail()?.order_code ?? 'Order handoff'"
            [subtitle]="detail() ? statusLabel(detail()!.status) : 'Loading'"
            [hasActionFooter]="detail() !== null"
            (openChange)="$event ? undefined : closeDetail()"
          >
            @if (detail(); as item) {
              <div class="space-y-5">
                <div class="flex flex-wrap gap-2">
                  <app-status-badge
                    [label]="statusLabel(item.status)"
                    [type]="statusTone(item.status)"
                  />
                  <app-status-badge
                    [label]="statusLabel(item.order_status)"
                    [type]="statusTone(item.order_status)"
                  />
                  @if (item.collection_kind === 'cod') {
                    <span class="badge badge-warning badge-sm"
                      >COD · KES {{ money(item.cod_balance ?? 0) }}</span
                    >
                  }
                </div>

                @if (
                  ['pending', 'processing'].includes(item.status) && canComplete() && !canProcess()
                ) {
                  <div class="alert border border-info/25 bg-info/10 text-sm" role="status">
                    <app-icon name="heroInformationCircle" />
                    <span>
                      Waiting for preparation. Dispatch becomes available when this order is marked
                      ready.
                    </span>
                  </div>
                }

                @if (item.recipient_name) {
                  <section class="border-y border-base-300 py-3">
                    <h3 class="type-heading">Recipient</h3>
                    <p class="mt-2 font-medium">{{ item.recipient_name }}</p>
                    @if (item.phone_normalized) {
                      <p class="text-sm">{{ item.phone_normalized }}</p>
                    }
                    @if (item.address_line) {
                      <p class="mt-2 text-sm">{{ item.address_line }}</p>
                    }
                    @if (item.landmark) {
                      <p class="type-caption">Near {{ item.landmark }}</p>
                    }
                    @if (item.handoff_notes) {
                      <p class="mt-2 text-sm text-base-content/70">{{ item.handoff_notes }}</p>
                    }
                  </section>
                }

                <section>
                  <h3 class="type-heading mb-2">Items</h3>
                  <div class="divide-y divide-base-200 border-y border-base-300">
                    @for (line of item.items; track line.name) {
                      <div class="flex gap-3 py-2 text-sm">
                        <strong class="w-10 text-right">{{ line.quantity }}x</strong>
                        <span>{{ line.name }}</span>
                      </div>
                    }
                  </div>
                  @if (item.preparation_notes) {
                    <p class="mt-3 border-l-2 border-warning pl-3 text-sm">
                      {{ item.preparation_notes }}
                    </p>
                  }
                </section>

                @if (canManage()) {
                  <label class="form-control">
                    <span class="label-text mb-1 text-sm font-medium">Assigned handoff</span>
                    <select
                      class="select select-bordered select-sm"
                      [ngModel]="item.assigned_membership_id ?? ''"
                      (ngModelChange)="assign(item, $event)"
                    >
                      <option value="" disabled>Choose a team member</option>
                      @for (assignee of assignees(); track assignee.membership_id) {
                        <option [value]="assignee.membership_id">
                          {{ assignee.display_name }}
                        </option>
                      }
                    </select>
                  </label>
                }

                @if (
                  item.collection_kind === 'cod' &&
                  item.status === 'in_transit' &&
                  (item.cod_balance ?? 0) > 0
                ) {
                  <section class="border-y border-base-300 py-3">
                    <h3 class="type-heading">Collect KES {{ money(item.cod_balance ?? 0) }}</h3>
                    @if (pendingCodSplit(); as split) {
                      <div class="alert alert-success mt-3 text-sm">
                        M-PESA {{ money(split.mpesa_amount) }} is recorded. Confirm the remaining
                        cash only after receiving it.
                      </div>
                      <div class="mt-3 flex flex-wrap gap-2">
                        @if (canComplete()) {
                          <button
                            class="btn btn-primary btn-sm"
                            type="button"
                            [disabled]="busy()"
                            (click)="confirmCodSplitCash(split)"
                          >
                            <app-icon name="heroBanknotes" /> Confirm KES
                            {{ money(split.cash_amount) }}
                          </button>
                        }
                        <button class="btn btn-ghost btn-sm" type="button" (click)="closeDetail()">
                          Leave pending
                        </button>
                      </div>
                    } @else {
                      <div class="mt-3 flex flex-wrap gap-2">
                        @if (canComplete()) {
                          <button
                            class="btn btn-primary btn-sm"
                            type="button"
                            [disabled]="busy()"
                            (click)="collectCash(item)"
                          >
                            <app-icon name="heroBanknotes" /> Cash
                          </button>
                        }
                        <button
                          class="btn btn-outline btn-sm"
                          type="button"
                          [disabled]="busy()"
                          (click)="mpesaOpen.set(!mpesaOpen())"
                        >
                          M-PESA / split
                        </button>
                      </div>
                      @if (mpesaOpen()) {
                        <div class="mt-3 grid gap-3 sm:grid-cols-2">
                          <label class="form-control sm:col-span-2">
                            <span class="label-text">M-PESA phone</span>
                            <input
                              class="input input-bordered min-h-11"
                              [(ngModel)]="mpesaPhone"
                              inputmode="tel"
                            />
                          </label>
                          <label class="form-control">
                            <span class="label-text">M-PESA amount</span>
                            <input
                              class="input input-bordered min-h-11"
                              type="number"
                              min="1"
                              [(ngModel)]="mpesaAmount"
                            />
                          </label>
                          @if (canComplete()) {
                            <label class="form-control">
                              <span class="label-text">Cash amount</span>
                              <input
                                class="input input-bordered min-h-11"
                                type="number"
                                min="0"
                                [(ngModel)]="mpesaCashAmount"
                              />
                            </label>
                          }
                          <button
                            class="btn btn-primary btn-sm sm:col-span-2"
                            type="button"
                            [disabled]="busy()"
                            (click)="collectMpesa(item)"
                          >
                            Send STK prompt
                          </button>
                        </div>
                      }
                    }
                  </section>
                }

                @if (
                  canComplete() &&
                  ((item.status === 'ready' && item.fulfillment_type === 'pickup') ||
                    (item.status === 'in_transit' &&
                      (item.collection_kind !== 'cod' || (item.cod_balance ?? 0) === 0)))
                ) {
                  <section>
                    <label class="form-control">
                      <span class="label-text mb-1 text-sm font-medium">Customer PIN</span>
                      <input
                        class="input input-bordered tracking-widest"
                        maxlength="6"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        [(ngModel)]="completionPin"
                      />
                    </label>
                    <button
                      class="btn btn-success mt-2 w-full"
                      type="button"
                      [disabled]="busy() || completionPin.length !== 6"
                      (click)="complete(item)"
                    >
                      <app-icon name="heroCheck" /> Complete handoff
                    </button>
                    @if (canOverridePin()) {
                      <button
                        class="btn btn-ghost mt-2 w-full"
                        type="button"
                        [disabled]="busy()"
                        (click)="openPinOverride(item)"
                      >
                        <app-icon name="heroKey" /> Override PIN
                      </button>
                    }
                  </section>
                }

                @if (canManage() && !['fulfilled', 'cancelled'].includes(item.status)) {
                  <button
                    class="btn btn-ghost btn-sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="regenerate(item)"
                  >
                    <app-icon name="heroKey" /> Regenerate tracking and PIN
                  </button>
                }

                <section>
                  <h3 class="type-heading mb-2">History</h3>
                  <ol class="space-y-3 border-l border-base-300 pl-4">
                    @for (event of item.events; track event.id) {
                      <li>
                        <div class="text-sm font-medium">
                          {{ eventLabel(event.event_kind, event.to_status) }}
                        </div>
                        <div class="type-caption">
                          {{ dateTime(event.created_at) }} · {{ statusLabel(event.source_kind) }}
                        </div>
                        @if (event.note) {
                          <p class="mt-1 text-sm text-base-content/65">{{ event.note }}</p>
                        }
                      </li>
                    }
                  </ol>
                </section>
              </div>
            }

            <div drawerFooter>
              @if (detail(); as item) {
                <div class="flex flex-wrap justify-end gap-2">
                  @if (item.status === 'pending' && canProcess()) {
                    <button
                      class="btn btn-primary"
                      type="button"
                      [disabled]="busy()"
                      (click)="startPreparation(item)"
                    >
                      Start preparation
                    </button>
                  }
                  @if (item.status === 'processing' && canProcess()) {
                    <button
                      class="btn btn-primary"
                      type="button"
                      [disabled]="busy()"
                      (click)="markReady(item)"
                    >
                      Mark ready
                    </button>
                  }
                  @if (
                    ['ready', 'failed'].includes(item.status) &&
                    canComplete() &&
                    !item.assigned_membership_id
                  ) {
                    <button
                      class="btn btn-outline"
                      type="button"
                      [disabled]="busy()"
                      (click)="claim(item)"
                    >
                      Claim
                    </button>
                  }
                  @if (
                    item.status === 'ready' &&
                    item.fulfillment_type === 'delivery' &&
                    canComplete() &&
                    item.assigned_membership_id
                  ) {
                    <button
                      class="btn btn-primary"
                      type="button"
                      [disabled]="busy()"
                      (click)="dispatch(item)"
                    >
                      <app-icon name="heroTruck" /> Dispatch
                    </button>
                  }
                  @if (item.status === 'in_transit' && canComplete()) {
                    <button
                      class="btn btn-warning"
                      type="button"
                      [disabled]="busy()"
                      (click)="openFulfillmentAction('failure', item)"
                    >
                      Delivery failed
                    </button>
                  }
                  @if (item.status === 'failed' && canComplete() && item.assigned_membership_id) {
                    <button
                      class="btn btn-primary"
                      type="button"
                      [disabled]="busy()"
                      (click)="retry(item)"
                    >
                      Retry
                    </button>
                  }
                  @if (canManage() && !['fulfilled', 'cancelled'].includes(item.status)) {
                    <button
                      class="btn btn-error btn-outline"
                      type="button"
                      [disabled]="busy()"
                      (click)="openFulfillmentAction('cancel_fulfillment', item)"
                    >
                      Cancel
                    </button>
                  }
                </div>
              }
            </div>
          </app-drawer>

          @if (actionKind(); as action) {
            <dialog
              class="modal modal-open"
              aria-modal="true"
              aria-labelledby="fulfillment-action-heading"
              (cancel)="$event.preventDefault(); closeActionDialog()"
            >
              <section class="modal-box modal-box-task p-0 md:w-full md:max-w-md">
                <header
                  class="flex min-h-14 items-center justify-between border-b border-base-300 px-4"
                >
                  <h2 id="fulfillment-action-heading" class="type-heading">
                    {{ actionTitle(action) }}
                  </h2>
                  <button
                    type="button"
                    class="btn btn-square btn-ghost btn-sm"
                    aria-label="Close"
                    title="Close"
                    (click)="closeActionDialog()"
                  >
                    <app-icon name="heroXMark" />
                  </button>
                </header>
                <div class="modal-body space-y-4 p-4">
                  @if (actionRemittance(); as remittance) {
                    <div
                      class="flex items-center justify-between gap-3 border-y border-base-300 py-3"
                    >
                      <span class="text-sm">{{ remittance.custodian_name }}</span>
                      <strong>KES {{ money(remittance.expected_amount) }}</strong>
                    </div>
                  }
                  @if (action === 'shortage') {
                    <label class="form-control">
                      <span class="label-text mb-1">Amount received</span>
                      <input
                        class="input input-bordered min-h-11"
                        type="number"
                        min="0"
                        [max]="(actionRemittance()?.expected_amount ?? 1) - 1"
                        [(ngModel)]="actionReceivedAmount"
                      />
                    </label>
                  }
                  @if (action !== 'accept') {
                    <label class="form-control">
                      <span class="label-text mb-1">Reason</span>
                      <textarea
                        class="textarea textarea-bordered min-h-24"
                        maxlength="500"
                        [(ngModel)]="actionReason"
                      ></textarea>
                    </label>
                  }
                </div>
                <footer class="flex justify-end gap-2 border-t border-base-300 p-4">
                  <button class="btn btn-ghost" type="button" (click)="closeActionDialog()">
                    Cancel
                  </button>
                  <button
                    class="btn"
                    [class.btn-primary]="action === 'accept' || action === 'pin_override'"
                    [class.btn-warning]="action === 'shortage' || action === 'failure'"
                    [class.btn-error]="action === 'reject' || action === 'cancel_fulfillment'"
                    type="button"
                    [disabled]="busy() || !actionReady(action)"
                    (click)="confirmAction(action)"
                  >
                    Confirm
                  </button>
                </footer>
              </section>
              <button
                type="button"
                class="modal-backdrop"
                aria-label="Close"
                (click)="closeActionDialog()"
              ></button>
            </dialog>
          }
        }
      } @else if (loading()) {
        <div class="flex min-h-72 items-center justify-center" aria-label="Loading orders">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else if (error()) {
        <app-empty-state
          icon="heroExclamationTriangle"
          title="Pickup & delivery could not load"
          description="Refresh the page or try again in a moment."
          [embedded]="true"
        />
      }
    </app-page>
  `,
})
export class FulfillmentComponent implements OnInit {
  private readonly fulfillment = inject(FulfillmentService);
  protected readonly locations = inject(LocationContextService);
  private readonly permissions = inject(PermissionsService);
  private readonly mpesa = inject(MpesaService);
  private readonly router = inject(Router);

  protected readonly statuses = STATUSES;
  protected readonly rows = signal<FulfillmentBoardRow[]>([]);
  protected readonly holdings = signal<CashHolding[]>([]);
  protected readonly remittances = signal<CashRemittance[]>([]);
  protected readonly assignees = signal<FulfillmentAssignee[]>([]);
  protected readonly locationSettings = signal<FulfillmentSettings | null>(null);
  protected readonly detail = signal<FulfillmentDetail | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly tab = signal<'board' | 'mine' | 'cash'>('board');
  protected readonly mobileStatus = signal<FulfillmentStatus>('ready');
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly selectedHoldingIds = signal<ReadonlySet<string>>(new Set());
  protected readonly mpesaOpen = signal(false);
  protected readonly pendingCodSplit = signal<PendingCodSplit | null>(null);
  protected completionPin = '';
  protected mpesaPhone = '';
  protected mpesaAmount = 0;
  protected mpesaCashAmount = 0;
  protected readonly actionKind = signal<FulfillmentAction | null>(null);
  protected readonly actionRemittance = signal<CashRemittance | null>(null);
  protected readonly actionFulfillment = signal<FulfillmentDetail | null>(null);
  protected actionReason = '';
  protected actionReceivedAmount = 0;
  private initialTabSelected = false;

  protected readonly canProcess = computed(
    () => this.permissions.has('ProcessFulfillments') || this.permissions.has('ManageFulfillments')
  );
  protected readonly canComplete = computed(
    () => this.permissions.has('CompleteFulfillments') || this.permissions.has('ManageFulfillments')
  );
  protected readonly canManage = computed(() => this.permissions.has('ManageFulfillments'));
  protected readonly canOverridePin = computed(
    () => this.permissions.has('ManageFulfillments') && this.permissions.has('ManageApprovals')
  );
  protected readonly canSettle = computed(() => this.permissions.has('SettleOrder'));
  protected readonly canConfigure = computed(() => this.permissions.has('ManageCompanySettings'));
  protected readonly canReconcile = computed(() => this.permissions.has('ManageReconciliation'));
  protected readonly activeRows = computed(() =>
    this.rows().filter(row => !['fulfilled', 'cancelled'].includes(row.status))
  );
  protected readonly recentRows = computed(() =>
    this.rows()
      .filter(row => row.status === 'fulfilled')
      .slice(0, 8)
  );

  constructor() {
    let priorLocation: string | null = null;
    effect(() => {
      if (this.permissions.ready() && !this.initialTabSelected) {
        this.initialTabSelected = true;
        if (this.canComplete() && !this.canProcess() && !this.canManage()) {
          this.tab.set('mine');
        } else if (!this.canProcess() && !this.canComplete() && this.canSettle()) {
          this.tab.set('cash');
        }
      }
      const locationId = this.locations.activeId();
      if (locationId && locationId !== priorLocation) {
        priorLocation = locationId;
        this.locationSettings.set(null);
        this.rows.set([]);
        void this.load();
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.locations.load();
    await this.load();
  }

  protected async selectTab(tab: 'board' | 'mine' | 'cash'): Promise<void> {
    this.tab.set(tab);
    await this.load();
  }

  protected rowsFor(status: FulfillmentStatus): FulfillmentBoardRow[] {
    return this.rows().filter(row => row.status === status);
  }

  protected async load(): Promise<void> {
    const locationId = this.locations.activeId();
    if (!locationId || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const settings = await this.fulfillment.settings(locationId);
      this.locationSettings.set(settings);
      if (!settings.feature_available || !settings.enabled) {
        this.rows.set([]);
        this.holdings.set([]);
        this.remittances.set([]);
        return;
      }
      if (this.tab() === 'cash') {
        const [holdings, remittances] = await Promise.all([
          this.canComplete() ? this.fulfillment.holdings(locationId) : Promise.resolve([]),
          this.fulfillment.remittances(locationId),
        ]);
        this.holdings.set(holdings);
        this.remittances.set(remittances);
      } else {
        const mine = this.tab() === 'mine';
        const [active, recent] = await Promise.all([
          this.fulfillment.board(locationId, {
            statuses: ['pending', 'processing', 'ready', 'in_transit', 'failed'],
            mine,
            limit: 250,
          }),
          this.fulfillment.board(locationId, { statuses: ['fulfilled'], mine, limit: 50 }),
        ]);
        this.rows.set([...active, ...recent]);
        if (this.canManage()) this.assignees.set(await this.fulfillment.assignees(locationId));
      }
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Pickup and delivery orders could not load'
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected openSettings(): void {
    void this.router.navigate(['/settings'], { queryParams: { tab: 'fulfillment' } });
  }

  protected async openDetail(row: FulfillmentBoardRow): Promise<void> {
    this.selectedId.set(row.id);
    this.completionPin = '';
    this.mpesaPhone = row.phone_normalized?.replace(/^\+/, '') ?? '';
    this.mpesaAmount = row.cod_balance ?? 0;
    this.mpesaCashAmount = 0;
    this.mpesaOpen.set(false);
    this.pendingCodSplit.set(null);
    try {
      const detail = await this.fulfillment.detail(row.id);
      this.detail.set(detail);
      if (
        detail.collection_kind === 'cod' &&
        detail.status === 'in_transit' &&
        this.canComplete()
      ) {
        this.pendingCodSplit.set(await this.fulfillment.pendingCodSplit(row.id));
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Order details could not load');
      this.closeDetail();
    }
  }

  protected closeDetail(): void {
    this.selectedId.set(null);
    this.detail.set(null);
    this.pendingCodSplit.set(null);
  }

  private async run(action: () => Promise<unknown>, message: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await action();
      this.notice.set(typeof result === 'string' ? result : message);
      const id = this.selectedId();
      await this.load();
      if (id) this.detail.set(await this.fulfillment.detail(id));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Order action failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected startPreparation(item: FulfillmentDetail): void {
    void this.run(
      () => this.fulfillment.startPreparation(item.id, item.state_version),
      'Preparation started'
    );
  }

  protected markReady(item: FulfillmentDetail): void {
    void this.run(
      () => this.fulfillment.markReady(item.id, item.state_version),
      'Order marked ready'
    );
  }

  protected retry(item: FulfillmentDetail): void {
    void this.run(
      () => this.fulfillment.retry(item.id, item.state_version),
      'Order returned to ready'
    );
  }

  protected claim(item: FulfillmentDetail): void {
    void this.run(() => this.fulfillment.claim(item.id, item.state_version), 'Order claimed');
  }

  protected assign(item: FulfillmentDetail, membershipId: string): void {
    if (!membershipId || membershipId === item.assigned_membership_id) return;
    void this.run(
      () => this.fulfillment.assign(item.id, membershipId, item.state_version),
      'Assignment updated'
    );
  }

  protected dispatch(item: FulfillmentDetail): void {
    void this.run(
      () => this.fulfillment.dispatch(item.id, item.state_version),
      'Delivery dispatched'
    );
  }

  protected collectCash(item: FulfillmentDetail): void {
    void this.run(
      () => this.fulfillment.collectCash(item.id, item.state_version),
      'COD cash collected'
    );
  }

  protected async collectMpesa(item: FulfillmentDetail): Promise<void> {
    if (this.mpesaAmount + this.mpesaCashAmount !== (item.cod_balance ?? 0)) {
      this.error.set('M-PESA and cash must equal the exact COD balance.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const intentId = await this.fulfillment.prepareCodMpesa({
        fulfillmentId: item.id,
        phone: this.mpesaPhone,
        mpesaAmount: this.mpesaAmount,
        cashAmount: this.mpesaCashAmount,
        clientRef: crypto.randomUUID(),
      });
      const result = await this.mpesa.waitForResult(intentId);
      if (result.status === 'awaiting_cash') {
        this.pendingCodSplit.set({
          intent_id: intentId,
          mpesa_amount: this.mpesaAmount,
          cash_amount: result.cash_amount,
          provider_receipt: result.provider_receipt,
        });
        this.mpesaOpen.set(false);
        this.notice.set('M-PESA is recorded. Confirm cash only after receiving it.');
      } else if (result.status !== 'completed') {
        throw new Error(
          result.status === 'manual_review'
            ? 'M-PESA was received and needs reconciliation. Do not collect again.'
            : (result.result_description ?? `M-PESA is ${result.status.replaceAll('_', ' ')}`)
        );
      } else {
        this.notice.set('COD M-PESA collected');
      }
      await this.load();
      this.detail.set(await this.fulfillment.detail(item.id));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'M-PESA could not be collected');
    } finally {
      this.busy.set(false);
    }
  }

  protected confirmCodSplitCash(split: PendingCodSplit): void {
    void this.run(async () => {
      await this.fulfillment.finalizeCodMpesaCash(split.intent_id);
      this.pendingCodSplit.set(null);
    }, 'COD split payment collected');
  }

  protected async complete(item: FulfillmentDetail): Promise<void> {
    await this.run(async () => {
      const result = await this.fulfillment.complete(
        item.id,
        this.completionPin,
        item.state_version
      );
      if (result.status === 'invalid_pin') {
        throw new Error(`Incorrect PIN. ${result.attempts_remaining ?? 0} attempts remain.`);
      }
      if (result.status === 'pin_locked') throw new Error('PIN entry is temporarily locked.');
      this.completionPin = '';
    }, 'Handoff completed');
  }

  protected regenerate(item: FulfillmentDetail): void {
    void this.run(async () => {
      const result = await this.fulfillment.regenerateAccess(item.id, item.state_version, true);
      return result.pin
        ? `Tracking access regenerated · new PIN ${result.pin}`
        : 'Tracking access regenerated';
    }, 'Tracking access regenerated');
  }

  protected toggleHolding(id: string): void {
    const selected = new Set(this.selectedHoldingIds());
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    this.selectedHoldingIds.set(selected);
  }

  protected submitHandoff(): void {
    const locationId = this.locations.activeId();
    if (!locationId) return;
    void this.run(async () => {
      await this.fulfillment.submitRemittance(locationId, [...this.selectedHoldingIds()]);
      this.selectedHoldingIds.set(new Set());
    }, 'Cash handoff submitted');
  }

  protected openRemittanceAction(
    kind: 'accept' | 'reject' | 'shortage',
    remittance: CashRemittance
  ): void {
    this.actionRemittance.set(remittance);
    this.actionFulfillment.set(null);
    this.actionReason = '';
    this.actionReceivedAmount = remittance.expected_amount;
    this.actionKind.set(kind);
  }

  protected openPinOverride(item: FulfillmentDetail): void {
    this.actionRemittance.set(null);
    this.actionFulfillment.set(item);
    this.actionReason = '';
    this.actionKind.set('pin_override');
  }

  protected openFulfillmentAction(
    kind: 'failure' | 'cancel_fulfillment',
    item: FulfillmentDetail
  ): void {
    this.actionRemittance.set(null);
    this.actionFulfillment.set(item);
    this.actionReason = '';
    this.actionKind.set(kind);
  }

  protected closeActionDialog(): void {
    if (this.busy()) return;
    this.actionKind.set(null);
    this.actionRemittance.set(null);
    this.actionFulfillment.set(null);
    this.actionReason = '';
  }

  protected actionTitle(action: FulfillmentAction): string {
    return {
      accept: 'Accept cash handoff',
      reject: 'Reject cash handoff',
      shortage: 'Resolve cash shortage',
      pin_override: 'Override customer PIN',
      failure: 'Report failed delivery',
      cancel_fulfillment: 'Cancel pickup or delivery',
    }[action];
  }

  protected actionReady(action: FulfillmentAction): boolean {
    if (action === 'accept') return this.actionRemittance() !== null;
    if (!this.actionReason.trim()) return false;
    if (action !== 'shortage') return true;
    const expected = this.actionRemittance()?.expected_amount ?? 0;
    return (
      Number.isFinite(this.actionReceivedAmount) &&
      this.actionReceivedAmount >= 0 &&
      this.actionReceivedAmount < expected
    );
  }

  protected confirmAction(action: FulfillmentAction): void {
    if (!this.actionReady(action)) return;
    const remittance = this.actionRemittance();
    const item = this.actionFulfillment();
    const reason = this.actionReason.trim();
    this.actionKind.set(null);
    this.actionRemittance.set(null);
    this.actionFulfillment.set(null);
    if (action === 'accept' && remittance) {
      void this.run(
        () => this.fulfillment.acceptRemittance(remittance.id),
        'Cash handoff accepted'
      );
    } else if (action === 'reject' && remittance) {
      void this.run(
        () => this.fulfillment.rejectRemittance(remittance.id, reason),
        'Cash handoff rejected'
      );
    } else if (action === 'shortage' && remittance) {
      void this.run(
        () => this.fulfillment.resolveShortage(remittance.id, this.actionReceivedAmount, reason),
        'Cash shortage reconciled'
      );
    } else if (action === 'pin_override' && item) {
      void this.run(
        () => this.fulfillment.complete(item.id, '', item.state_version, reason),
        'Handoff completed with approval override'
      );
    } else if (action === 'failure' && item) {
      void this.run(
        () => this.fulfillment.reportFailure(item.id, item.state_version, reason),
        'Delivery failure recorded'
      );
    } else if (action === 'cancel_fulfillment' && item) {
      void this.run(async () => {
        const result = await this.fulfillment.cancel(item.id, item.state_version, reason);
        if (result.status === 'payment_resolution_required') {
          throw new Error(
            'Collected COD must be refunded or reversed before this order handoff can be cancelled.'
          );
        }
        return result.status === 'approval_required'
          ? 'Cancellation sent for approval'
          : 'Pickup or delivery cancelled';
      }, 'Pickup or delivery cancelled');
    }
  }

  protected money(value: number): string {
    return Number(value ?? 0).toLocaleString('en-KE');
  }

  protected dateTime(value: string | null): string {
    if (!value) return 'Not scheduled';
    return new Date(value).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected dueLabel(value: string | null): string {
    if (!value) return 'No promise time';
    const delta = new Date(value).getTime() - Date.now();
    if (delta < 0) return `${Math.max(1, Math.round(Math.abs(delta) / 60000))} min late`;
    return `Due in ${Math.max(1, Math.round(delta / 60000))} min`;
  }

  protected statusLabel(value: string): string {
    return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  protected statusTone(value: string): BadgeType {
    if (['fulfilled', 'completed', 'accepted'].includes(value)) return 'success';
    if (['failed', 'cancelled', 'rejected'].includes(value)) return 'error';
    if (
      ['ready', 'in_transit', 'pending_payment', 'submitted', 'shortage_resolved'].includes(value)
    )
      return 'warning';
    if (['processing'].includes(value)) return 'info';
    return 'neutral';
  }

  protected columnClass(status: FulfillmentStatus): string {
    return {
      pending: 'border-base-content/25',
      processing: 'border-info',
      ready: 'border-warning',
      in_transit: 'border-primary',
      failed: 'border-error',
      fulfilled: 'border-success',
      cancelled: 'border-base-content/25',
    }[status];
  }

  protected eventLabel(kind: string, status: FulfillmentStatus | null): string {
    if (kind === 'status_changed' && status) return this.statusLabel(status);
    return this.statusLabel(kind);
  }
}

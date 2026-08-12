import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { BadgeType, StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import {
  CommissionAssignment,
  CommissionPeriod,
  CommissionPlan,
  CommissionStatementRow,
  CommissionsService,
  StaffProfile,
} from './commissions.service';

@Component({
  selector: 'app-commissions',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    DataTableShellComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    PageLayoutComponent,
    StatCardComponent,
    StatusBadgeComponent,
    MobileListComponent,
    DrawerComponent,
    PageActionsComponent,
  ],
  template: `
    <app-page
      title="Commissions"
      subtitle="Assign effective-dated rates and prepare reviewable commission statements from net collections."
      [wide]="true"
    >
      <app-page-actions actions>
        <button
          utilityAction
          appButton
          variant="ghost"
          [iconOnly]="true"
          [loading]="loading()"
          type="button"
          title="Refresh commissions"
          aria-label="Refresh commissions"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
        @if (activeTab() === 'plans') {
          <button primaryAction appButton type="button" (click)="openPlanCreate()">
            <app-icon name="heroPlus" /> New plan
          </button>
        } @else if (activeTab() === 'assignments') {
          <button
            primaryAction
            appButton
            type="button"
            [disabled]="staff().length === 0 || activePlans().length === 0"
            (click)="openAssignmentCreate()"
          >
            <app-icon name="heroPlus" /> Assign plan
          </button>
        } @else {
          <button primaryAction appButton type="button" (click)="periodFormOpen.set(true)">
            <app-icon name="heroPlus" /> Generate
          </button>
        }
      </app-page-actions>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-4 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-4 text-sm">
          <app-icon name="heroCheckCircle" />
          <span>{{ notice() }}</span>
        </div>
      }

      <div role="tablist" aria-label="Commission section" class="tabs tabs-box mb-3 w-fit">
        @for (item of commissionTabs; track item.value) {
          <button
            role="tab"
            type="button"
            class="tab min-h-11"
            [class.tab-active]="activeTab() === item.value"
            [attr.aria-selected]="activeTab() === item.value"
            (click)="activeTab.set(item.value)"
          >
            {{ item.label }}
          </button>
        }
      </div>

      <div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <app-stat-card
          label="Active plans"
          [value]="String(activePlanCount())"
          sub="Available commission rates"
        />
        <app-stat-card
          label="Assignments"
          [value]="String(assignments().length)"
          sub="Effective-dated staff rules"
        />
        <app-stat-card
          label="Draft commission"
          [value]="fmt(periodTotal('draft'))"
          sub="Still open for review"
          tone="warning"
        />
        <app-stat-card
          label="Approved / paid"
          [value]="fmt(periodTotal('approved') + periodTotal('paid'))"
          sub="Locked statements"
          tone="success"
        />
      </div>

      <section class="mb-6 grid items-start gap-4 xl:grid-cols-2">
        @if (activeTab() === 'plans') {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <div>
                <h2 class="section-title">Commission plans</h2>
                <p class="type-caption mt-1">
                  Rates apply to net collected sales, including reversals.
                </p>
              </div>
              @if (plans().length > 0) {
                <app-mobile-list class="mt-4 border-t border-base-300 pt-3">
                  @for (plan of plans(); track plan.id) {
                    <div mobileListRow class="p-3">
                      <div class="flex items-center gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <p class="truncate font-semibold">{{ plan.name }}</p>
                            <app-status-badge
                              size="xs"
                              [type]="plan.active ? 'success' : 'neutral'"
                              [label]="plan.active ? 'Active' : 'Inactive'"
                            />
                          </div>
                          <p class="type-caption mt-1">
                            {{ plan.effective_from }} → {{ plan.effective_to || 'ongoing' }}
                          </p>
                        </div>
                        <div class="shrink-0 text-right">
                          <p class="font-semibold">{{ rate(plan.rate_bps) }}</p>
                          <div class="mt-1 flex items-center gap-1">
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              (click)="startPlanEdit(plan)"
                            >
                              Edit
                            </button>
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              [disabled]="busy()"
                              (click)="togglePlan(plan)"
                            >
                              {{ plan.active ? 'Deactivate' : 'Activate' }}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                </app-mobile-list>
                <div class="mt-4 hidden border-t border-base-300 pt-3 lg:block">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Plan</th>
                        <th class="text-right">Rate</th>
                        <th>Effective dates</th>
                        <th class="text-right">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (plan of plans(); track plan.id) {
                        <tr>
                          <td class="font-medium">{{ plan.name }}</td>
                          <td class="text-right">{{ rate(plan.rate_bps) }}</td>
                          <td>{{ plan.effective_from }} → {{ plan.effective_to || 'ongoing' }}</td>
                          <td class="text-right">
                            <div class="flex justify-end gap-1">
                              <button
                                appButton
                                variant="ghost"
                                size="sm"
                                [disabled]="busy()"
                                (click)="startPlanEdit(plan)"
                              >
                                Edit
                              </button>
                              <button
                                appButton
                                variant="ghost"
                                size="sm"
                                [disabled]="busy()"
                                (click)="togglePlan(plan)"
                              >
                                {{ plan.active ? 'Deactivate' : 'Activate' }}
                              </button>
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        }

        @if (activeTab() === 'assignments') {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <div>
                <h2 class="section-title">Staff assignments</h2>
                <p class="type-caption mt-1">
                  One non-overlapping plan can apply to a staff member at a time.
                </p>
              </div>
              @if (staff().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroUserGroup"
                  title="No staff profiles"
                  description="Add and name team members before assigning commission plans."
                />
              } @else if (activePlans().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroBanknotes"
                  title="No active plan"
                  description="Create or reactivate a plan before assigning it."
                />
              }

              @if (assignments().length > 0) {
                <app-mobile-list class="mt-4 border-t border-base-300 pt-3">
                  @for (assignment of assignments(); track assignment.id) {
                    <button
                      mobileListRow
                      type="button"
                      class="flex min-h-20 w-full items-center gap-3 p-3 text-left"
                      (click)="startAssignmentEdit(assignment)"
                    >
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-semibold">
                          {{ staffName(assignment.staff_user_id) }}
                        </p>
                        <p class="type-caption mt-1 truncate">
                          {{ assignment.effective_from }} →
                          {{ assignment.effective_to || 'ongoing' }}
                        </p>
                      </div>
                      <p class="shrink-0 font-medium">{{ planNameFor(assignment.plan_id) }}</p>
                    </button>
                  }
                </app-mobile-list>
                <div class="mt-4 hidden border-t border-base-300 pt-3 lg:block">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Staff member</th>
                        <th>Plan</th>
                        <th>Effective dates</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (assignment of assignments(); track assignment.id) {
                        <tr>
                          <td class="font-medium">{{ staffName(assignment.staff_user_id) }}</td>
                          <td>{{ planNameFor(assignment.plan_id) }}</td>
                          <td>
                            {{ assignment.effective_from }} →
                            {{ assignment.effective_to || 'ongoing' }}
                          </td>
                          <td class="text-right">
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              [disabled]="busy()"
                              (click)="startAssignmentEdit(assignment)"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        }
      </section>

      @if (activeTab() === 'statements') {
        <section>
          <div class="mb-3">
            <h2 class="section-title">Commission periods</h2>
            <p class="type-caption mt-1">
              Drafts can be regenerated; approved and paid periods are locked.
            </p>
          </div>

          @if (!loading() && periods().length === 0) {
            <app-empty-state
              [compact]="true"
              icon="heroBanknotes"
              title="No commission periods"
              description="Generate a draft after assigning plans and collecting sales."
            />
          } @else {
            <app-mobile-list>
              @for (period of periods(); track period.id) {
                <button
                  mobileListRow
                  type="button"
                  class="flex min-h-20 w-full items-center gap-3 p-3 text-left"
                  (click)="openStatement(period)"
                >
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold">{{ period.start_date }} → {{ period.end_date }}</p>
                    <div class="mt-1 flex items-center gap-2">
                      <app-status-badge
                        size="xs"
                        [type]="periodBadge(period.status)"
                        [label]="period.status"
                      />
                      <span class="type-caption">{{ period.staff_count }} staff</span>
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="font-semibold"><app-money [amount]="period.commission_total" /></p>
                    <p class="type-caption">basis <app-money [amount]="period.basis_total" /></p>
                  </div>
                </button>
              }
            </app-mobile-list>
            <div class="hidden lg:block">
              <app-data-table-shell
                heading="Statements"
                [description]="
                  periods().length + ' generated periods · collected basis is net of reversals'
                "
              >
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Status</th>
                      <th class="text-right">Staff</th>
                      <th class="text-right">Net collected basis</th>
                      <th class="text-right">Commission</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (period of periods(); track period.id) {
                      <tr>
                        <td>
                          <p class="font-medium">{{ period.start_date }} → {{ period.end_date }}</p>
                          @if (period.paid_at || period.approved_at) {
                            <p class="type-caption mt-0.5">
                              {{
                                period.paid_at
                                  ? 'Paid ' + dateTime(period.paid_at)
                                  : 'Approved ' + dateTime(period.approved_at)
                              }}
                            </p>
                          }
                        </td>
                        <td>
                          <app-status-badge
                            size="xs"
                            [type]="periodBadge(period.status)"
                            [label]="period.status"
                          />
                        </td>
                        <td class="text-right">{{ period.staff_count }}</td>
                        <td class="text-right"><app-money [amount]="period.basis_total" /></td>
                        <td class="text-right font-semibold">
                          <app-money [amount]="period.commission_total" />
                        </td>
                        <td class="table-actions">
                          <button
                            appButton
                            variant="ghost"
                            size="sm"
                            (click)="openStatement(period)"
                          >
                            Review
                          </button>
                          @if (period.status === 'draft') {
                            <button
                              appButton
                              variant="outline"
                              size="sm"
                              [disabled]="busy()"
                              (click)="transition(period, 'approved')"
                            >
                              Approve
                            </button>
                          } @else if (period.status === 'approved') {
                            <button
                              appButton
                              variant="outline"
                              size="sm"
                              [disabled]="busy()"
                              (click)="transition(period, 'paid')"
                            >
                              Mark paid
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </app-data-table-shell>
            </div>
          }
        </section>
      }

      @if (planFormOpen()) {
        <app-drawer
          #planDrawer
          [open]="true"
          [title]="editingPlan() ? 'Edit commission plan' : 'New commission plan'"
          subtitle="Set the rate and effective dates"
          [dirty]="planName.dirty || planRate.dirty || planFrom.dirty || planTo.dirty"
          (closed)="closePlanForm()"
        >
          <form
            id="commission-plan-form"
            class="grid gap-4"
            (submit)="$event.preventDefault(); savePlan()"
          >
            <app-form-field label="Plan name" [required]="true">
              <input
                type="text"
                class="input input-bordered w-full"
                placeholder="Standard sales"
                [formControl]="planName"
              />
            </app-form-field>
            <app-form-field label="Rate (%)" [required]="true" hint="0 to 100%">
              <input
                type="number"
                class="input input-bordered w-full"
                min="0"
                max="100"
                step="0.01"
                [formControl]="planRate"
              />
            </app-form-field>
            <app-form-field label="Effective from" [required]="true">
              <input type="date" class="input input-bordered w-full" [formControl]="planFrom" />
            </app-form-field>
            <app-form-field label="Effective to" hint="Leave blank for no end date">
              <input type="date" class="input input-bordered w-full" [formControl]="planTo" />
            </app-form-field>
          </form>
          <div drawerFooter class="flex justify-end gap-2">
            <button appButton variant="ghost" type="button" (click)="planDrawer.requestClose()">
              Cancel
            </button>
            <button
              appButton
              type="submit"
              form="commission-plan-form"
              [loading]="busy()"
              [disabled]="
                !planName.value.trim() ||
                planRate.value == null ||
                planRate.value < 0 ||
                planRate.value > 100
              "
            >
              {{ editingPlan() ? 'Save plan' : 'Create plan' }}
            </button>
          </div>
        </app-drawer>
      }

      @if (assignmentFormOpen()) {
        <app-drawer
          #assignmentDrawer
          [open]="true"
          [title]="editingAssignment() ? 'Edit assignment' : 'Assign commission plan'"
          subtitle="Choose who the plan applies to and when"
          [dirty]="
            assignmentStaff.dirty ||
            assignmentPlan.dirty ||
            assignmentFrom.dirty ||
            assignmentTo.dirty
          "
          (closed)="closeAssignmentForm()"
        >
          <form
            id="commission-assignment-form"
            class="grid gap-4"
            (submit)="$event.preventDefault(); assignPlan()"
          >
            <app-form-field label="Staff member" [required]="true">
              <select class="select select-bordered w-full" [formControl]="assignmentStaff">
                @for (person of staff(); track person.user_id) {
                  <option [value]="person.user_id">
                    {{ person.display_name }} · {{ person.last_role_name || 'No current role' }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field label="Plan" [required]="true">
              <select class="select select-bordered w-full" [formControl]="assignmentPlan">
                @for (plan of activePlans(); track plan.id) {
                  <option [value]="plan.id">{{ plan.name }} · {{ rate(plan.rate_bps) }}</option>
                }
              </select>
            </app-form-field>
            <app-form-field label="Effective from" [required]="true">
              <input
                type="date"
                class="input input-bordered w-full"
                [formControl]="assignmentFrom"
              />
            </app-form-field>
            <app-form-field label="Effective to" hint="Leave blank for no end date">
              <input type="date" class="input input-bordered w-full" [formControl]="assignmentTo" />
            </app-form-field>
          </form>
          <div drawerFooter class="flex justify-end gap-2">
            <button
              appButton
              variant="ghost"
              type="button"
              (click)="assignmentDrawer.requestClose()"
            >
              Cancel
            </button>
            <button
              appButton
              type="submit"
              form="commission-assignment-form"
              [loading]="busy()"
              [disabled]="!assignmentStaff.value || !assignmentPlan.value"
            >
              {{ editingAssignment() ? 'Save assignment' : 'Assign plan' }}
            </button>
          </div>
        </app-drawer>
      }

      @if (periodFormOpen()) {
        <app-drawer
          #periodDrawer
          [open]="true"
          title="Generate commission statement"
          subtitle="Create or regenerate a draft for this period"
          [dirty]="periodFrom.dirty || periodTo.dirty"
          (closed)="closePeriodForm()"
        >
          <form
            id="commission-period-form"
            class="grid gap-4"
            (submit)="$event.preventDefault(); generatePeriod()"
          >
            <app-form-field label="Period from" [required]="true">
              <input type="date" class="input input-bordered w-full" [formControl]="periodFrom" />
            </app-form-field>
            <app-form-field label="Period to" [required]="true">
              <input type="date" class="input input-bordered w-full" [formControl]="periodTo" />
            </app-form-field>
          </form>
          <div drawerFooter class="flex justify-end gap-2">
            <button appButton variant="ghost" type="button" (click)="periodDrawer.requestClose()">
              Cancel
            </button>
            <button appButton type="submit" form="commission-period-form" [loading]="busy()">
              Generate draft
            </button>
          </div>
        </app-drawer>
      }

      @if (selectedPeriod(); as period) {
        <div
          class="modal modal-open"
          role="dialog"
          aria-modal="true"
          aria-label="Commission statement"
        >
          <div class="modal-box max-w-4xl">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="section-title">Commission statement</h2>
                  <app-status-badge
                    size="xs"
                    [type]="periodBadge(period.status)"
                    [label]="period.status"
                  />
                </div>
                <p class="type-caption mt-1">{{ period.start_date }} → {{ period.end_date }}</p>
              </div>
              <button
                appButton
                variant="ghost"
                [iconOnly]="true"
                aria-label="Close"
                (click)="closeStatement()"
              >
                <app-icon name="heroXMark" />
              </button>
            </div>

            @if (statementLoading()) {
              <div class="flex min-h-40 items-center justify-center">
                <span class="loading loading-spinner loading-md"></span>
              </div>
            } @else if (statement().length === 0) {
              <app-empty-state
                [embedded]="true"
                [compact]="true"
                icon="heroBanknotes"
                title="No eligible collections"
                description="Check staff assignments, plan dates, and collected sales in this period."
              />
            } @else {
              <app-mobile-list class="mt-4">
                @for (row of statement(); track row.staff_user_id) {
                  <div mobileListRow class="flex min-h-20 items-center gap-3 p-3">
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-semibold">{{ row.staff_name }}</p>
                      <p class="type-caption mt-1">
                        {{ row.event_count }} events · basis
                        <app-money [amount]="row.basis_total" />
                      </p>
                    </div>
                    <p class="shrink-0 font-semibold">
                      <app-money [amount]="row.commission_total" />
                    </p>
                  </div>
                }
              </app-mobile-list>
              <div class="mt-4 hidden lg:block">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Staff member</th>
                      <th class="text-right">Events</th>
                      <th class="text-right">Net collected basis</th>
                      <th class="text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of statement(); track row.staff_user_id) {
                      <tr>
                        <td class="font-medium">{{ row.staff_name }}</td>
                        <td class="text-right">{{ row.event_count }}</td>
                        <td class="text-right"><app-money [amount]="row.basis_total" /></td>
                        <td class="text-right font-semibold">
                          <app-money [amount]="row.commission_total" />
                        </td>
                      </tr>
                    }
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <th></th>
                      <th class="text-right"><app-money [amount]="period.basis_total" /></th>
                      <th class="text-right"><app-money [amount]="period.commission_total" /></th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            }

            @if (period.status === 'draft' && staff().length > 0) {
              <form
                class="mt-5 grid items-end gap-3 border-t border-base-300 pt-4 sm:grid-cols-[1fr_10rem_1fr_auto]"
                (submit)="$event.preventDefault(); addAdjustment()"
              >
                <app-form-field label="Adjustment staff">
                  <select
                    class="select select-bordered select-sm w-full"
                    [formControl]="adjustmentStaff"
                  >
                    @for (person of staff(); track person.user_id) {
                      <option [value]="person.user_id">{{ person.display_name }}</option>
                    }
                  </select>
                </app-form-field>
                <app-form-field label="Amount (KES)" hint="Negative allowed">
                  <input
                    type="number"
                    step="0.01"
                    class="input input-bordered input-sm w-full"
                    [formControl]="adjustmentAmount"
                  />
                </app-form-field>
                <app-form-field label="Reason">
                  <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Bonus or correction"
                    [formControl]="adjustmentReason"
                  />
                </app-form-field>
                <button
                  appButton
                  variant="outline"
                  type="submit"
                  [loading]="busy()"
                  [disabled]="
                    !adjustmentStaff.value ||
                    !adjustmentAmount.value ||
                    !adjustmentReason.value.trim()
                  "
                >
                  Add
                </button>
              </form>
            }

            <p class="type-caption mt-4">
              “Mark paid” records payout status only; it does not create a bank, cash, or payroll
              ledger entry.
            </p>
          </div>
          <button
            class="modal-backdrop"
            type="button"
            aria-label="Close"
            (click)="closeStatement()"
          ></button>
        </div>
      }
    </app-page>
  `,
})
export class CommissionsComponent implements OnInit {
  private readonly commissions = inject(CommissionsService);

  protected readonly fmt = formatKes;
  protected readonly String = String;
  protected readonly plans = signal<CommissionPlan[]>([]);
  protected readonly assignments = signal<CommissionAssignment[]>([]);
  protected readonly staff = signal<StaffProfile[]>([]);
  protected readonly periods = signal<CommissionPeriod[]>([]);
  protected readonly statement = signal<CommissionStatementRow[]>([]);
  protected readonly selectedPeriod = signal<CommissionPeriod | null>(null);
  protected readonly editingPlan = signal<CommissionPlan | null>(null);
  protected readonly editingAssignment = signal<CommissionAssignment | null>(null);
  protected readonly loading = signal(false);
  protected readonly statementLoading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly activeTab = signal<'plans' | 'assignments' | 'statements'>('plans');
  protected readonly planFormOpen = signal(false);
  protected readonly assignmentFormOpen = signal(false);
  protected readonly periodFormOpen = signal(false);
  protected readonly commissionTabs = [
    { value: 'plans' as const, label: 'Plans' },
    { value: 'assignments' as const, label: 'Assignments' },
    { value: 'statements' as const, label: 'Statements' },
  ];

  protected readonly planName = new FormControl('', { nonNullable: true });
  protected readonly planRate = new FormControl(2, { nonNullable: true });
  protected readonly planFrom = new FormControl(this.todayIso(), { nonNullable: true });
  protected readonly planTo = new FormControl('', { nonNullable: true });

  protected readonly assignmentStaff = new FormControl('', { nonNullable: true });
  protected readonly assignmentPlan = new FormControl('', { nonNullable: true });
  protected readonly assignmentFrom = new FormControl(this.todayIso(), { nonNullable: true });
  protected readonly assignmentTo = new FormControl('', { nonNullable: true });

  protected readonly periodFrom = new FormControl(this.monthStartIso(), { nonNullable: true });
  protected readonly periodTo = new FormControl(this.todayIso(), { nonNullable: true });

  protected readonly adjustmentStaff = new FormControl('', { nonNullable: true });
  protected readonly adjustmentAmount = new FormControl(0, { nonNullable: true });
  protected readonly adjustmentReason = new FormControl('', { nonNullable: true });

  protected readonly activePlans = computed(() => this.plans().filter(plan => plan.active));
  protected readonly activePlanCount = computed(() => this.activePlans().length);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [configuration, periods] = await Promise.all([
        this.commissions.configuration(),
        this.commissions.periods(),
      ]);
      this.plans.set(configuration.plans);
      this.assignments.set(configuration.assignments);
      this.staff.set(configuration.staff);
      this.periods.set(periods);
      this.seedSelections();
    } catch (err) {
      this.error.set(this.message(err, 'Failed to load commissions'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async savePlan(): Promise<void> {
    const rateBps = Math.round(this.planRate.value * 100);
    if (!this.planName.value.trim()) return this.fail('Enter a plan name');
    if (this.planRate.value == null) return this.fail('Enter a commission rate');
    if (rateBps < 0 || rateBps > 10_000) return this.fail('Rate must be between 0% and 100%');
    if (this.planTo.value && this.planFrom.value > this.planTo.value) {
      return this.fail('The plan start date must be before its end date');
    }
    const fallback = this.editingPlan()
      ? 'Failed to update commission plan'
      : 'Failed to create commission plan';
    await this.run(async () => {
      await this.commissions.savePlan({
        planId: this.editingPlan()?.id,
        name: this.planName.value,
        rateBps,
        effectiveFrom: this.planFrom.value,
        effectiveTo: this.planTo.value,
        active: this.editingPlan()?.active ?? true,
      });
      const updated = Boolean(this.editingPlan());
      this.closePlanForm();
      this.notice.set(updated ? 'Commission plan updated' : 'Commission plan created');
      await this.load();
    }, fallback);
  }

  protected startPlanEdit(plan: CommissionPlan): void {
    this.editingPlan.set(plan);
    this.planName.setValue(plan.name);
    this.planRate.setValue(plan.rate_bps / 100);
    this.planFrom.setValue(plan.effective_from);
    this.planTo.setValue(plan.effective_to ?? '');
    this.planFormOpen.set(true);
  }

  protected openPlanCreate(): void {
    this.closePlanForm();
    this.planFormOpen.set(true);
  }

  protected closePlanForm(): void {
    this.planFormOpen.set(false);
    this.editingPlan.set(null);
    this.planName.setValue('');
    this.planRate.setValue(2);
    this.planFrom.setValue(this.todayIso());
    this.planTo.setValue('');
    [this.planName, this.planRate, this.planFrom, this.planTo].forEach(control =>
      control.markAsPristine()
    );
  }

  protected async togglePlan(plan: CommissionPlan): Promise<void> {
    await this.run(async () => {
      await this.commissions.savePlan({
        planId: plan.id,
        name: plan.name,
        rateBps: plan.rate_bps,
        effectiveFrom: plan.effective_from,
        effectiveTo: plan.effective_to ?? undefined,
        active: !plan.active,
      });
      this.notice.set(`${plan.name} ${plan.active ? 'deactivated' : 'activated'}`);
      await this.load();
    }, 'Failed to update commission plan');
  }

  protected async assignPlan(): Promise<void> {
    if (!this.assignmentStaff.value || !this.assignmentPlan.value) {
      return this.fail('Choose a staff member and plan');
    }
    if (this.assignmentTo.value && this.assignmentFrom.value > this.assignmentTo.value) {
      return this.fail('The assignment start date must be before its end date');
    }
    await this.run(async () => {
      await this.commissions.assignPlan({
        assignmentId: this.editingAssignment()?.id,
        planId: this.assignmentPlan.value,
        staffUserId: this.assignmentStaff.value,
        effectiveFrom: this.assignmentFrom.value,
        effectiveTo: this.assignmentTo.value,
      });
      const updated = Boolean(this.editingAssignment());
      this.closeAssignmentForm();
      this.notice.set(updated ? 'Commission assignment updated' : 'Commission plan assigned');
      await this.load();
    }, 'Failed to assign commission plan');
  }

  protected startAssignmentEdit(assignment: CommissionAssignment): void {
    this.editingAssignment.set(assignment);
    this.assignmentStaff.setValue(assignment.staff_user_id);
    this.assignmentPlan.setValue(assignment.plan_id);
    this.assignmentFrom.setValue(assignment.effective_from);
    this.assignmentTo.setValue(assignment.effective_to ?? '');
    this.assignmentFormOpen.set(true);
  }

  protected openAssignmentCreate(): void {
    this.closeAssignmentForm();
    this.assignmentFormOpen.set(true);
  }

  protected closeAssignmentForm(): void {
    this.assignmentFormOpen.set(false);
    this.editingAssignment.set(null);
    this.assignmentFrom.setValue(this.todayIso());
    this.assignmentTo.setValue('');
    this.seedSelections();
    [this.assignmentStaff, this.assignmentPlan, this.assignmentFrom, this.assignmentTo].forEach(
      control => control.markAsPristine()
    );
  }

  protected closePeriodForm(): void {
    this.periodFormOpen.set(false);
    this.periodFrom.setValue(this.monthStartIso());
    this.periodTo.setValue(this.todayIso());
    this.periodFrom.markAsPristine();
    this.periodTo.markAsPristine();
  }

  protected async generatePeriod(): Promise<void> {
    if (this.periodFrom.value > this.periodTo.value) {
      return this.fail('The period start date must be before its end date');
    }
    await this.run(async () => {
      await this.commissions.generatePeriod(this.periodFrom.value, this.periodTo.value);
      this.notice.set('Draft commission statement generated');
      this.closePeriodForm();
      await this.load();
    }, 'Failed to generate commission period');
  }

  protected async openStatement(period: CommissionPeriod): Promise<void> {
    this.selectedPeriod.set(period);
    this.statementLoading.set(true);
    this.error.set(null);
    try {
      this.statement.set(await this.commissions.statement(period.id));
    } catch (err) {
      this.error.set(this.message(err, 'Failed to load commission statement'));
      this.closeStatement();
    } finally {
      this.statementLoading.set(false);
    }
  }

  protected closeStatement(): void {
    this.selectedPeriod.set(null);
    this.statement.set([]);
  }

  protected async transition(period: CommissionPeriod, status: 'approved' | 'paid'): Promise<void> {
    const verb = status === 'approved' ? 'approve and lock' : 'mark as paid';
    if (!window.confirm(`Are you sure you want to ${verb} this commission period?`)) return;
    await this.run(async () => {
      await this.commissions.updatePeriodStatus(period.id, status);
      this.notice.set(
        status === 'approved'
          ? 'Commission period approved and locked'
          : 'Commission period marked paid'
      );
      await this.load();
      if (this.selectedPeriod()?.id === period.id) this.closeStatement();
    }, `Failed to mark commission period ${status}`);
  }

  protected async addAdjustment(): Promise<void> {
    const period = this.selectedPeriod();
    const amount = Math.round(this.adjustmentAmount.value);
    if (!period || period.status !== 'draft') return;
    if (!amount || !this.adjustmentReason.value.trim() || !this.adjustmentStaff.value) {
      return this.fail('Choose staff, enter a non-zero amount, and give a reason');
    }
    await this.run(async () => {
      await this.commissions.addAdjustment(
        period.id,
        this.adjustmentStaff.value,
        amount,
        this.adjustmentReason.value
      );
      this.adjustmentAmount.setValue(0);
      this.adjustmentReason.setValue('');
      this.notice.set('Commission adjustment added');
      const [periods, statement] = await Promise.all([
        this.commissions.periods(),
        this.commissions.statement(period.id),
      ]);
      this.periods.set(periods);
      this.statement.set(statement);
      this.selectedPeriod.set(periods.find(item => item.id === period.id) ?? period);
    }, 'Failed to add commission adjustment');
  }

  protected periodTotal(status: CommissionPeriod['status']): number {
    return this.periods()
      .filter(period => period.status === status)
      .reduce((total, period) => total + period.commission_total, 0);
  }

  protected staffName(userId: string): string {
    return (
      this.staff().find(person => person.user_id === userId)?.display_name ??
      `Staff …${userId.slice(-6)}`
    );
  }

  protected planNameFor(planId: string): string {
    return this.plans().find(plan => plan.id === planId)?.name ?? `Plan …${planId.slice(-6)}`;
  }

  protected rate(rateBps: number): string {
    return `${(rateBps / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}%`;
  }

  protected periodBadge(status: string): BadgeType {
    if (status === 'paid') return 'success';
    if (status === 'approved') return 'info';
    return 'warning';
  }

  protected dateTime(value: string): string {
    return new Date(value).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private seedSelections(): void {
    const activePlans = this.activePlans();
    if (!activePlans.some(plan => plan.id === this.assignmentPlan.value)) {
      this.assignmentPlan.setValue(activePlans[0]?.id ?? '');
    }
    if (!this.staff().some(person => person.user_id === this.assignmentStaff.value)) {
      this.assignmentStaff.setValue(this.staff()[0]?.user_id ?? '');
    }
    if (!this.staff().some(person => person.user_id === this.adjustmentStaff.value)) {
      this.adjustmentStaff.setValue(this.staff()[0]?.user_id ?? '');
    }
  }

  private async run(action: () => Promise<void>, fallback: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
    } catch (err) {
      this.error.set(this.message(err, fallback));
    } finally {
      this.busy.set(false);
    }
  }

  private fail(message: string): void {
    this.error.set(message);
  }

  private message(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
  }

  private monthStartIso(): string {
    return `${this.todayIso().slice(0, 8)}01`;
  }

  private todayIso(): string {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
}

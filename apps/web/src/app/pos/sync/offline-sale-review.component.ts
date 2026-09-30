import { ServerClockService } from '../../core/server-clock.service';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PermissionsService } from '../../core/permissions.service';
import { formatKes } from '../../core/money';
import { OfflinePostingService } from '../offline/offline-posting.service';
import { MobileListComponent } from '../../shared/ui/mobile-list.component';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import {
  offlineBlockerLabel,
  type OfflineRequest,
  type OfflineReview,
  type OfflineReviewLine,
} from '../offline/offline-contract';

@Component({
  selector: 'app-offline-sale-review',
  imports: [FormsModule, RouterLink, MobileListComponent, DataTableShellComponent],
  template: `
    <section class="space-y-4" aria-label="Review queued sale">
      <div class="flex items-center justify-between gap-3">
        <h2 class="type-title">Review queued sale</h2>
        <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="closed.emit()">
          Back to pending sales
        </button>
      </div>
      @if (error()) {
        <p role="alert" class="text-sm text-error">{{ error() }}</p>
      }
      @if (review(); as r) {
        <div class="grid gap-3 rounded-box border border-base-300 p-4 md:grid-cols-3">
          <div>
            <span class="type-caption">Captured</span>
            <p>{{ date(r.captured_at) }} · {{ age(r) }}</p>
          </div>
          <div>
            <span class="type-caption">Originating session</span>
            <p>{{ sessionLabel(r.original_session) }}</p>
          </div>
          <div>
            <span class="type-caption">VAT at posting</span>
            <p>
              {{
                r.vat.active_profile?.vat_registered
                  ? 'Current VAT rules apply'
                  : 'VAT currently off'
              }}
            </p>
            <a class="link text-sm" routerLink="/settings" [queryParams]="{ section: 'tax' }"
              >VAT settings</a
            >
          </div>
          <label class="form-control md:col-span-3">
            <span class="label">Post into this open session</span>
            <select
              class="select select-bordered w-full"
              [ngModel]="destination()"
              (ngModelChange)="selectDestination($event)"
              [disabled]="busy()"
            >
              <option value="">Select a session</option>
              @for (session of r.open_sessions; track session.id) {
                <option [value]="session.id">{{ sessionLabel(session) }}</option>
              }
            </select>
          </label>
          @if (!r.open_sessions.length) {
            <p class="text-sm text-warning md:col-span-3">
              Open a session at this sale’s location using the normal session controls, then
              refresh.
            </p>
          }
        </div>
        @if (r.status === 'approval') {
          <p class="rounded-box bg-info/10 p-3 text-sm">
            This sale needs a separate approval.
            <a class="link" routerLink="/approvals">Open approvals</a>, then check its status to
            continue posting from this device.
          </p>
          <button
            class="btn btn-outline btn-sm"
            [disabled]="busy() || proposalEdited() || !!editing()"
            (click)="resumeApprovedSale()"
          >
            Check approval and post
          </button>
        }
        @if (r.blockers.length) {
          <div class="rounded-box bg-warning/10 p-4" role="status">
            <p class="font-semibold">Before this sale can post</p>
            <ul class="list-disc pl-5 text-sm">
              @for (blocker of r.blockers; track $index) {
                <li>{{ blockerLabel(blocker) }}</li>
              }
            </ul>
          </div>
        }
        <app-mobile-list class="lg:hidden" aria-label="Captured and proposed items">
          @for (line of r.lines; track line.index) {
            <div class="space-y-2 border-b border-base-300 p-3 last:border-b-0">
              <p class="font-semibold">
                {{ line.captured.capture?.product_name || 'Item ' + (line.index + 1) }}
              </p>
              @for (reason of line.reasons; track reason) {
                <p class="text-sm text-warning">{{ blockerLabel({ code: reason }) }}</p>
              }
              <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt>Captured</dt>
                <dd>
                  {{ line.captured.quantity }} × {{ fmt(charged(line.captured)) }}<br />{{
                    line.captured_base_quantity
                  }}
                  {{ line.captured.capture?.stock_unit }}
                </dd>
                <dt>Current catalogue</dt>
                <dd>
                  {{ fmt(line.current.expected_unit_price) }} each · floor
                  {{ fmt(line.current.price_floor ?? 0) }}<br />{{ line.current.units_per_unit }}
                  {{ line.current.stock_unit }} per {{ line.current.unit_name }}
                </dd>
                <dt>Proposed posting</dt>
                <dd>
                  {{ line.proposed.quantity }} × {{ fmt(charged(line.proposed)) }}<br />{{
                    line.proposed_base_quantity
                  }}
                  {{ line.proposed.capture?.stock_unit }}
                </dd>
                <dt>Difference</dt>
                <dd>
                  {{
                    fmt(
                      line.proposed.quantity * charged(line.proposed) -
                        line.captured.quantity * charged(line.captured)
                    )
                  }}
                </dd>
                @if (line.current.tax_treatment; as tax) {
                  <dt>Net / VAT {{ tax.tax_rate_bps / 100 }}%</dt>
                  <dd>{{ fmt(tax.net_total) }} / {{ fmt(tax.tax_total) }}</dd>
                }
              </dl>
              @if (!line.current.available) {
                <p class="text-sm text-warning">Unavailable — resolve in catalogue</p>
              } @else if (permissions.has('OverridePrice') || permissions.has('ManageCatalog')) {
                <button class="btn btn-outline btn-sm" [disabled]="busy()" (click)="editLine(line)">
                  Correct this line
                </button>
              }
            </div>
          }
        </app-mobile-list>
        <div class="hidden lg:block">
          <app-data-table-shell [stickyHeader]="false">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Captured</th>
                  <th>Current catalogue</th>
                  <th>Proposed posting</th>
                </tr>
              </thead>
              <tbody>
                @for (line of r.lines; track line.index) {
                  <tr>
                    <td class="align-top">
                      <p class="font-semibold">
                        {{ line.captured.capture?.product_name || 'Item ' + (line.index + 1) }}
                      </p>
                      <p class="type-caption">{{ line.captured.capture?.variant_name }}</p>
                      @for (reason of line.reasons; track reason) {
                        <p class="mt-1 text-xs text-warning">
                          {{ blockerLabel({ code: reason }) }}
                        </p>
                      }
                    </td>
                    <td class="align-top">
                      <p>
                        {{ line.captured.quantity }} ×
                        {{ line.captured.capture?.unit_name || 'item' }}
                      </p>
                      <p class="type-caption">
                        {{ line.captured_base_quantity }} {{ line.captured.capture?.stock_unit }} in
                        base units
                      </p>
                      <p>{{ fmt(charged(line.captured)) }} each</p>
                      <p class="type-caption">
                        Catalogue
                        {{ fmt(line.captured.expected_unit_price ?? line.captured.unit_price) }} ·
                        floor {{ fmt(line.captured.capture?.price_floor ?? 0) }}
                      </p>
                    </td>
                    <td class="align-top">
                      <p>{{ line.current.product_name }} {{ line.current.unit_name }}</p>
                      <p class="type-caption">
                        {{ line.current.units_per_unit }} {{ line.current.stock_unit }} per unit
                      </p>
                      <p>{{ fmt(line.current.expected_unit_price) }} each</p>
                      <p class="type-caption">Floor {{ fmt(line.current.price_floor ?? 0) }}</p>
                      <p class="type-caption">
                        {{
                          line.current.available
                            ? 'Available'
                            : 'Unavailable — resolve in catalogue'
                        }}
                      </p>
                    </td>
                    <td class="align-top">
                      <p>{{ line.proposed.quantity }} × {{ line.proposed.capture?.unit_name }}</p>
                      <p class="type-caption">
                        {{ line.proposed_base_quantity }} {{ line.proposed.capture?.stock_unit }} in
                        base units
                      </p>
                      <p>{{ fmt(charged(line.proposed)) }} each</p>
                      <p class="type-caption">
                        Difference
                        {{
                          fmt(
                            line.proposed.quantity * charged(line.proposed) -
                              line.captured.quantity * charged(line.captured)
                          )
                        }}
                      </p>
                      @if (line.current.tax_treatment; as tax) {
                        <p class="type-caption">
                          Net {{ fmt(tax.net_total) }} · VAT {{ tax.tax_rate_bps / 100 }}%:
                          {{ fmt(tax.tax_total) }}
                        </p>
                      }
                      @if (
                        line.current.available &&
                        (permissions.has('OverridePrice') || permissions.has('ManageCatalog'))
                      ) {
                        <button
                          class="btn btn-outline btn-xs mt-2"
                          [disabled]="busy()"
                          (click)="editLine(line)"
                        >
                          Correct this line
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>
        @if (editing(); as line) {
          <div class="space-y-3 rounded-box border border-primary p-4">
            <h3 class="font-semibold">Correct item {{ line.index + 1 }}</h3>
            <p class="text-sm">
              Use the current catalogue definition: 1 {{ line.current.unit_name }} =
              {{ line.current.units_per_unit }} {{ line.current.stock_unit }}. Enter the intended
              quantity explicitly.
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              <label
                >Quantity<input
                  type="number"
                  class="input input-bordered w-full"
                  min="0.001"
                  step="0.001"
                  [(ngModel)]="editQuantity"
              /></label>
              <label
                >Charged price per unit<input
                  type="number"
                  class="input input-bordered w-full"
                  min="0"
                  step="1"
                  [(ngModel)]="editPrice"
              /></label>
            </div>
            <p class="text-sm">
              Proposed base quantity: {{ editQuantity * line.current.units_per_unit }}
              {{ line.current.stock_unit }}. Line total: {{ fmt(editQuantity * editPrice) }}.
            </p>
            <label class="block"
              >Correction / override reason<input
                class="input input-bordered w-full"
                [(ngModel)]="editReason"
                maxlength="1000"
            /></label>
            <p class="type-caption">
              The original capture stays unchanged. Price overrides and catalogue corrections
              require their usual permissions; below-floor prices still require approval.
            </p>
            <button
              class="btn btn-primary btn-sm"
              [disabled]="
                busy() || editQuantity <= 0 || editPrice < 0 || editReason.trim().length < 3
              "
              (click)="applyCorrection()"
            >
              Review proposed correction
            </button>
            <button class="btn btn-ghost btn-sm" (click)="editing.set(null)">Cancel edit</button>
          </div>
        }
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2 rounded-box border border-base-300 p-4">
            <h3 class="font-semibold">Payments retained</h3>
            @for (payment of r.payments; track $index) {
              <p class="flex justify-between">
                <span>{{ payment.method }} {{ payment.reference }}</span
                ><strong>{{ fmt(payment.amount) }}</strong>
              </p>
            }
            <p class="flex justify-between border-t border-base-300 pt-2">
              <span>Proposed total</span><strong>{{ fmt(r.total) }}</strong>
            </p>
            <p class="type-caption">
              Payments are kept while posting is blocked. Resolve any difference through the normal
              payment or refund process.
            </p>
            @if (r.proposed_request.fulfillment; as f) {
              <p class="text-sm">{{ f.type }} · {{ f.phone }}</p>
            }
          </div>
          <div class="space-y-3 rounded-box border border-base-300 p-4">
            @if (needsCrossover()) {
              <label class="flex items-start gap-2"
                ><input type="checkbox" class="checkbox checkbox-sm" [(ngModel)]="crossover" /><span
                  class="text-sm"
                  >I confirm moving this sale from its originating session into
                  {{ sessionLabel(r.destination_session) }}.</span
                ></label
              >
            }
            @if (needsCashResolution()) {
              <p class="font-semibold">Reconcile late cash</p>
              <p class="type-caption">
                How much of this sale’s cash was already included in the original closing count?
                This requires reconciliation permission.
              </p>
              <label
                >Previously counted amount<input
                  type="number"
                  class="input input-bordered w-full"
                  min="0"
                  [max]="cashTotal()"
                  [(ngModel)]="includedCash"
                  [disabled]="!permissions.has('ManageReconciliation')"
              /></label>
              @if (r.original_closing_count) {
                <p class="type-caption">
                  Original count {{ r.original_closing_count.id.slice(0, 8) }} ·
                  {{ fmt(r.original_closing_count.declared_cash) }}
                </p>
              }
            }
            <label class="block"
              >Review reason<textarea
                class="textarea textarea-bordered w-full"
                [(ngModel)]="reason"
                maxlength="1000"
                rows="2"
              ></textarea>
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                class="btn btn-primary btn-sm"
                [disabled]="
                  busy() ||
                  !destination() ||
                  reason.trim().length < 3 ||
                  (r.status === 'approval' && !proposalEdited()) ||
                  !!editing() ||
                  (needsCrossover() && !crossover) ||
                  (needsCashResolution() && includedCash === null)
                "
                (click)="confirm()"
              >
                {{ busy() ? 'Checking…' : 'Confirm and post' }}
              </button>
              <button class="btn btn-outline btn-sm" [disabled]="busy()" (click)="reload()">
                Refresh review
              </button>
            </div>
          </div>
        </div>
        @if (permissions.has('ManageReconciliation')) {
          <details class="rounded-box border border-base-300 p-4">
            <summary class="cursor-pointer text-sm font-semibold">
              Cancel and resolve this sale
            </summary>
            <p class="my-3 text-sm">
              Only confirm after returning the collected payment through the normal process. The
              original request and this resolution remain in the audit record.
            </p>
            <label class="block"
              >Payment return reference<input
                class="input input-bordered w-full"
                [(ngModel)]="returnReference"
            /></label>
            <label class="mt-3 block"
              >Cash previously included in a closing count<input
                type="number"
                class="input input-bordered w-full"
                min="0"
                [max]="cashTotal()"
                [(ngModel)]="cancelCountedCash"
            /></label>
            <button
              class="btn btn-error btn-outline btn-sm mt-3"
              [disabled]="
                busy() ||
                reason.trim().length < 3 ||
                returnReference.trim().length < 3 ||
                cancelCountedCash === null
              "
              (click)="cancelSale()"
            >
              Confirm payment returned and cancel
            </button>
          </details>
        }
      } @else if (busy()) {
        <p role="status">Loading review…</p>
      }
    </section>
  `,
})
export class OfflineSaleReviewComponent {
  readonly reviewId = input.required<string>();
  readonly closed = output<void>();
  readonly resolved = output<void>();
  protected readonly permissions = inject(PermissionsService);
  private readonly clock = inject(ServerClockService);
  private readonly posting = inject(OfflinePostingService);
  protected readonly review = signal<OfflineReview | null>(null);
  protected readonly destination = signal('');
  protected readonly proposalEdited = signal(false);
  protected readonly editing = signal<OfflineReviewLine | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly fmt = formatKes;
  protected readonly blockerLabel = offlineBlockerLabel;
  protected readonly needsCrossover = computed(
    () =>
      !!this.review() &&
      (this.review()!.original_session?.status !== 'open' ||
        this.review()!.original_session?.id !== this.destination())
  );
  protected readonly cashTotal = computed(
    () =>
      this.review()
        ?.payments.filter(p => p.method === 'cash')
        .reduce((sum, p) => sum + p.amount, 0) ?? 0
  );
  protected readonly needsCashResolution = computed(
    () => this.cashTotal() > 0 && this.review()?.original_session?.status !== 'open'
  );
  protected reason = '';
  protected crossover = false;
  protected includedCash: number | null = null;
  protected cancelCountedCash: number | null = null;
  protected returnReference = '';
  protected editQuantity = 0;
  protected editPrice = 0;
  protected editReason = '';
  private confirmationKey = crypto.randomUUID();
  private requestSequence = 0;

  constructor() {
    effect(() => {
      const id = this.reviewId();
      untracked(() => {
        this.destination.set('');
        this.review.set(null);
        this.proposalEdited.set(false);
        this.reason = '';
        this.includedCash = null;
        this.cancelCountedCash = null;
        this.returnReference = '';
        void this.load(id);
      });
    });
  }

  protected date(iso: string) {
    return new Date(iso).toLocaleString('en-KE');
  }
  protected age(r: OfflineReview) {
    return `${Math.max(0, Math.floor(((this.clock.now() ?? Date.parse(r.server_time)) - Date.parse(r.captured_at)) / 3600000))} hours old`;
  }
  protected sessionLabel(session: OfflineReview['original_session']) {
    return session
      ? `${session.id.slice(0, 8)} · opened ${this.date(session.opened_at)} · ${session.status}`
      : 'No confirmed session';
  }
  protected charged(line: OfflineReviewLine['captured']) {
    return line.custom_price ?? line.unit_price;
  }

  private async load(id: string, proposed?: OfflineRequest) {
    const sequence = ++this.requestSequence;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.posting.review(id, this.destination() || undefined, proposed);
      if (sequence !== this.requestSequence) return;
      if (r.status === 'completed' || r.status === 'cancelled') {
        this.resolved.emit();
        return;
      }
      this.review.set(r);
      this.destination.set(
        r.destination_session?.status === 'open' ? r.destination_session.id : ''
      );
      this.confirmationKey = crypto.randomUUID();
      this.crossover = false;
    } catch (e) {
      if (sequence === this.requestSequence)
        this.error.set(e instanceof Error ? e.message : 'Could not load review');
    } finally {
      if (sequence === this.requestSequence) this.busy.set(false);
    }
  }
  protected reload() {
    return this.load(this.reviewId(), this.review()?.proposed_request);
  }
  protected selectDestination(id: string) {
    this.proposalEdited.set(true);
    this.destination.set(id);
    void this.reload();
  }
  protected editLine(line: OfflineReviewLine) {
    this.editing.set(line);
    this.editQuantity = line.proposed.quantity;
    this.editPrice = this.charged(line.proposed);
    this.editReason = '';
  }
  protected async applyCorrection() {
    const line = this.editing();
    const review = this.review();
    if (!line || !review) return;
    const proposed = structuredClone(review.proposed_request);
    proposed.lines[line.index] = {
      ...line.proposed,
      quantity: this.editQuantity,
      units_per_unit: line.current.units_per_unit,
      expected_unit_price: line.current.expected_unit_price,
      unit_price: line.current.expected_unit_price,
      custom_price: this.editPrice,
      override_reason: this.editReason,
      capture: line.current,
    };
    this.proposalEdited.set(true);
    await this.load(this.reviewId(), proposed);
    this.editing.set(null);
  }
  protected async confirm() {
    const r = this.review();
    if (!r || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const cash = this.needsCashResolution()
        ? {
            included_amount: this.includedCash!,
            closing_count_id: r.original_closing_count?.id,
            reason: this.reason,
          }
        : undefined;
      const result = await this.posting.confirm(
        r,
        this.confirmationKey,
        this.reason,
        this.crossover,
        cash
      );
      if (result.status === 'completed' || result.status === 'cancelled') this.resolved.emit();
      else {
        this.proposalEdited.set(false);
        await this.reload();
        this.error.set(
          result.blockers.map(offlineBlockerLabel).join('. ') ||
            'This sale is waiting for approval.'
        );
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Posting has not been confirmed.');
    } finally {
      this.busy.set(false);
    }
  }
  protected async resumeApprovedSale() {
    const review = this.review();
    if (
      !review ||
      review.status !== 'approval' ||
      this.busy() ||
      this.proposalEdited() ||
      this.editing()
    )
      return;
    this.busy.set(true);
    this.error.set('');
    try {
      // Custody already contains the original request, even on another device.
      // Replay resumes its active revision without creating another approval.
      const result = await this.posting.submit(review.original_request);
      if (result.status === 'completed' || result.status === 'cancelled') this.resolved.emit();
      else {
        await this.reload();
        this.error.set(
          result.status === 'approval'
            ? 'This sale is still waiting for approval.'
            : result.blockers.map(offlineBlockerLabel).join('. ')
        );
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Posting has not been confirmed.');
    } finally {
      this.busy.set(false);
    }
  }
  protected async cancelSale() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.posting.cancel(this.reviewId(), this.reason, {
        action: 'payment_returned',
        reference: this.returnReference,
        included_in_closing_count: this.cancelCountedCash,
        closing_count_id: this.review()?.original_closing_count?.id ?? null,
      });
      if (result.status === 'completed' || result.status === 'cancelled') this.resolved.emit();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Resolution was not confirmed.');
    } finally {
      this.busy.set(false);
    }
  }
}

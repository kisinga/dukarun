import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { CashierSessionService } from '../services/cashier-session.service';
import { OrderTenderInput } from '../services/cashier-settlement.service';
import { CompanyService } from '@dukarun/company';
import { CurrencyService } from '../../../shared/services/currency.service';
import { PaymentMethod, PaymentMethodService } from '@dukarun/payments';

/** Context for a collection: the total to collect and who/what it's for. */
export interface SettleOrderModalData {
  /** Amount to collect, in smallest currency unit (cents). */
  total: number;
  orderCode?: string;
  customerName?: string;
}

interface MethodRef {
  code: string;
  name: string;
}

/**
 * Collect Payment (cash + M-Pesa split)
 *
 * The single money-collection control, used both in the cashier queue and inline at
 * checkout. Because there are exactly two methods, they are complements: the slider
 * splits the fixed total between M-Pesa and cash, so it can never mis-add. Drag to
 * split, type either amount for precision, or use the ± steppers / quick chips.
 *
 * It does NOT talk to the backend. On confirm it emits the resulting tenders; the parent
 * decides what to do (settle a parked order, or create+settle inline) and reports back via
 * succeed()/fail(). This keeps one UI with two call sites.
 */
@Component({
  selector: 'app-settle-order-modal',
  imports: [CommonModule, FormsModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #modal class="modal modal-bottom sm:modal-middle" (click)="onBackdropClick($event)">
      <div
        class="modal-box max-w-md w-full mx-4 max-h-[92vh] overflow-y-auto p-4 sm:p-6"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-base-300">
          <div>
            <h3 class="text-lg font-bold text-base-content">
              Collect {{ formatCurrency(total()) }}
            </h3>
            @if (contextLine(); as ctx) {
              <div class="text-xs text-base-content/60 mt-0.5">{{ ctx }}</div>
            }
          </div>
          <button
            class="btn btn-sm btn-circle btn-ghost"
            type="button"
            [disabled]="phase() === 'processing'"
            (click)="onCancel()"
            aria-label="Close"
          >
            <ng-icon name="heroXMark" size="1.25rem" />
          </button>
        </div>

        @if (phase() === 'success') {
          <div class="alert alert-success">
            <ng-icon name="heroCheckCircle" size="1.5rem" />
            <div class="flex-1">
              <div class="font-semibold">Payment collected</div>
              <div class="text-xs mt-1">{{ formatCurrency(total()) }} settled in full</div>
            </div>
          </div>
        } @else {
          <!-- Error -->
          @if (error(); as err) {
            <div class="alert alert-error mb-4">
              <ng-icon name="heroXCircle" size="1.25rem" />
              <span class="text-sm">{{ err }}</span>
            </div>
          }

          <!-- No session -->
          @if (!cashierSessionService.hasActiveSession()) {
            <div class="alert alert-warning mb-4">
              <ng-icon name="heroExclamationTriangle" size="1.25rem" />
              <span class="text-sm"
                >Open a shift to collect payments. Go to the Dashboard and tap "Open shift"
                first.</span
              >
            </div>
          }

          @if (isLoadingMethods()) {
            <div class="flex items-center justify-center py-8">
              <span class="loading loading-spinner loading-md"></span>
            </div>
          } @else if (!cashMethod() || !mpesaMethod()) {
            <div class="alert alert-warning">
              <ng-icon name="heroExclamationTriangle" size="1.25rem" />
              <span class="text-sm"
                >Cash and M-Pesa must both be set up as payment methods to collect here.</span
              >
            </div>
          } @else {
            <!-- Two readouts -->
            <div class="grid grid-cols-2 gap-3 mb-3">
              <div class="p-3 rounded-lg bg-success/10 border border-success/30">
                <div class="text-xs font-semibold text-success">M-Pesa</div>
                <div class="flex items-center gap-1 mt-1">
                  <button
                    class="btn btn-xs btn-circle btn-ghost"
                    type="button"
                    (click)="nudgeMpesa(-1)"
                    aria-label="Less M-Pesa"
                  >
                    –
                  </button>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-sm input-bordered w-full text-center font-bold"
                    [ngModel]="mpesaDisplay()"
                    (ngModelChange)="onMpesaTyped($event)"
                    aria-label="M-Pesa amount"
                  />
                  <button
                    class="btn btn-xs btn-circle btn-ghost"
                    type="button"
                    (click)="nudgeMpesa(1)"
                    aria-label="More M-Pesa"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="p-3 rounded-lg bg-base-200 border border-base-300">
                <div class="text-xs font-semibold text-base-content/70">Cash</div>
                <div class="flex items-center gap-1 mt-1">
                  <button
                    class="btn btn-xs btn-circle btn-ghost"
                    type="button"
                    (click)="nudgeMpesa(1)"
                    aria-label="Less cash"
                  >
                    –
                  </button>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-sm input-bordered w-full text-center font-bold"
                    [ngModel]="cashDisplay()"
                    (ngModelChange)="onCashTyped($event)"
                    aria-label="Cash amount"
                  />
                  <button
                    class="btn btn-xs btn-circle btn-ghost"
                    type="button"
                    (click)="nudgeMpesa(-1)"
                    aria-label="More cash"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <!-- Slider: M-Pesa (left) ↔ Cash (right) -->
            <input
              type="range"
              class="range range-primary range-sm w-full"
              min="0"
              [max]="total()"
              [step]="step()"
              [ngModel]="mpesaCents()"
              (ngModelChange)="setMpesa($any($event))"
              aria-label="Split between M-Pesa and cash"
            />
            <div class="flex justify-between text-xs text-base-content/50 mt-1 mb-3">
              <span>All M-Pesa</span>
              <span>All cash</span>
            </div>

            <!-- Quick presets -->
            <div class="flex gap-2 mb-3">
              <button class="btn btn-xs flex-1" type="button" (click)="setMpesa(0)">
                All cash
              </button>
              <button class="btn btn-xs flex-1" type="button" (click)="setMpesa(halfCents())">
                50 / 50
              </button>
              <button class="btn btn-xs flex-1" type="button" (click)="setMpesa(total())">
                All M-Pesa
              </button>
            </div>

            <!-- M-Pesa reference (only when M-Pesa portion > 0) -->
            @if (mpesaCents() > 0) {
              <input
                type="text"
                class="input input-bordered input-sm w-full mb-3"
                placeholder="M-Pesa reference (e.g. QGH7X…) — optional"
                [ngModel]="reference()"
                (ngModelChange)="reference.set($event)"
                aria-label="M-Pesa reference"
              />
            }

            <!-- Actions -->
            <div class="flex flex-col gap-2">
              <button
                class="btn btn-primary w-full"
                type="button"
                [class.loading]="phase() === 'processing'"
                [disabled]="!canConfirm()"
                (click)="onConfirm()"
              >
                @if (phase() === 'processing') {
                  Processing…
                } @else {
                  Collect {{ formatCurrency(total()) }}
                }
              </button>
              <button
                class="btn btn-ghost w-full"
                type="button"
                [disabled]="phase() === 'processing'"
                (click)="onCancel()"
              >
                Cancel
              </button>
            </div>
          }
        }
      </div>

      <form method="dialog" class="modal-backdrop">
        <button type="submit" (click)="onCancel()">close</button>
      </form>
    </dialog>
  `,
})
export class SettleOrderModalComponent implements OnDestroy {
  private readonly paymentMethodService = inject(PaymentMethodService);
  private successTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly cashierSessionService = inject(CashierSessionService);
  private readonly companyService = inject(CompanyService);
  readonly currencyService = inject(CurrencyService);

  /** Emitted on confirm with the tenders to collect; the parent performs the settlement. */
  readonly confirm = output<OrderTenderInput[]>();
  /** Emitted after a successful settlement (parent called succeed()). */
  readonly settled = output<void>();
  readonly cancelled = output<void>();

  private readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  private readonly data = signal<SettleOrderModalData | null>(null);
  readonly phase = signal<'form' | 'processing' | 'success'>('form');
  readonly error = signal<string | null>(null);
  readonly isLoadingMethods = signal(false);
  readonly cashMethod = signal<MethodRef | null>(null);
  readonly mpesaMethod = signal<MethodRef | null>(null);

  /** Single source of truth: how much of the total goes to M-Pesa (cents). Cash is the rest. */
  readonly mpesaCents = signal(0);
  readonly reference = signal('');

  readonly total = computed(() => this.data()?.total ?? 0);
  readonly cashCents = computed(() => Math.max(this.total() - this.mpesaCents(), 0));
  readonly halfCents = computed(() => this.snap(Math.round(this.total() / 2)));
  readonly step = computed(() => this.niceStep(this.total()));

  readonly mpesaDisplay = computed(() => this.toUnits(this.mpesaCents()));
  readonly cashDisplay = computed(() => this.toUnits(this.cashCents()));

  readonly contextLine = computed(() => {
    const d = this.data();
    if (!d) return '';
    return [d.orderCode, d.customerName].filter(Boolean).join(' · ');
  });

  readonly canConfirm = computed(
    () =>
      this.phase() === 'form' &&
      this.cashierSessionService.hasActiveSession() &&
      this.total() > 0 &&
      !!this.cashMethod() &&
      !!this.mpesaMethod(),
  );

  /** Open the modal for a given total. */
  async show(data: SettleOrderModalData): Promise<void> {
    this.data.set(data);
    this.phase.set('form');
    this.error.set(null);
    this.reference.set('');
    this.mpesaCents.set(0); // default: all cash

    const companyId = this.companyService.activeCompanyId();
    if (companyId) {
      const channelId = parseInt(companyId, 10);
      if (!isNaN(channelId)) {
        await firstValueFrom(this.cashierSessionService.getCurrentSession(channelId));
      }
    }
    await this.loadMethods();

    this.modalRef()?.nativeElement.showModal();
  }

  hide(): void {
    this.modalRef()?.nativeElement.close();
  }

  /** Parent → modal: settlement succeeded. Shows the success state, then closes. */
  succeed(): void {
    this.phase.set('success');
    this.clearSuccessTimer();
    this.successTimer = setTimeout(() => {
      this.successTimer = null;
      this.hide();
      this.settled.emit();
    }, 1400);
  }

  ngOnDestroy(): void {
    this.clearSuccessTimer();
  }

  private clearSuccessTimer(): void {
    if (this.successTimer) {
      clearTimeout(this.successTimer);
      this.successTimer = null;
    }
  }

  /** Parent → modal: settlement failed; re-enable the form with a message. */
  fail(message: string): void {
    this.phase.set('form');
    this.error.set(message);
  }

  private async loadMethods(): Promise<void> {
    this.isLoadingMethods.set(true);
    try {
      const methods = await this.paymentMethodService.getPaymentMethods();
      const active = methods.filter((m) => m.enabled && m.customFields?.isActive !== false);
      this.cashMethod.set(this.pick(active, /cash/i));
      this.mpesaMethod.set(this.pick(active, /m-?pesa/i));
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to load payment methods.');
      this.cashMethod.set(null);
      this.mpesaMethod.set(null);
    } finally {
      this.isLoadingMethods.set(false);
    }
  }

  private pick(methods: PaymentMethod[], pattern: RegExp): MethodRef | null {
    const m = methods.find((pm) => pattern.test(pm.code) || pattern.test(pm.name));
    return m ? { code: m.code, name: m.name } : null;
  }

  setMpesa(cents: number): void {
    const clamped = Math.min(Math.max(Math.round(cents), 0), this.total());
    this.mpesaCents.set(clamped);
  }

  nudgeMpesa(direction: number): void {
    this.setMpesa(this.snap(this.mpesaCents() + direction * this.step()));
  }

  onMpesaTyped(value: string): void {
    this.setMpesa(this.parseCents(value));
  }

  onCashTyped(value: string): void {
    this.setMpesa(this.total() - this.parseCents(value));
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    const cash = this.cashMethod();
    const mpesa = this.mpesaMethod();
    const tenders: OrderTenderInput[] = [];
    if (this.cashCents() > 0 && cash) {
      tenders.push({ paymentMethodCode: cash.code, amount: this.cashCents() });
    }
    if (this.mpesaCents() > 0 && mpesa) {
      tenders.push({
        paymentMethodCode: mpesa.code,
        amount: this.mpesaCents(),
        referenceNumber: this.reference().trim() || undefined,
      });
    }
    if (tenders.length === 0) return;
    this.phase.set('processing');
    this.error.set(null);
    this.confirm.emit(tenders);
  }

  onCancel(): void {
    if (this.phase() === 'processing') return;
    this.hide();
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    const modal = this.modalRef()?.nativeElement;
    if (modal && event.target === modal) {
      this.onCancel();
    }
  }

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents, false);
  }

  /** Round to the nearest slider step so drag/steppers land on clean values. */
  private snap(cents: number): number {
    const s = this.step();
    return Math.round(cents / s) * s;
  }

  /** A "nice" slider step scaled to the total (~20 stops), in cents. */
  private niceStep(total: number): number {
    if (total <= 0) return 100;
    const target = total / 20;
    const nice = [100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
    for (const s of nice) {
      if (s >= target) return s;
    }
    return nice[nice.length - 1];
  }

  private parseCents(raw: string): number {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return 0;
    const parsed = parseFloat(trimmed.replace(/,/g, ''));
    if (Number.isNaN(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100);
  }

  private toUnits(cents: number): string {
    return (cents / 100).toFixed(2);
  }
}

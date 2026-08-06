import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { CurrencyService } from '../../../../../shared/services/currency.service';
import type { OrderMargin } from '../../../operations.graphql';

/**
 * Order Margin Block Component
 *
 * Shows net revenue, COGS and margin for the order. When the margin is an estimate
 * (reliable=false) an "Estimate" badge and plain-language reasons are shown, with an
 * optional "Recalculate cost" action for skipped-COGS orders.
 */
@Component({
  selector: 'app-order-margin-block',
  imports: [CommonModule, NgIcon],
  template: `
    <div class="w-full">
      <div class="flex items-center gap-2 mb-2">
        <h4 class="text-sm font-semibold text-base-content/70">Order margin</h4>
        @if (margin() && !margin()!.reliable) {
          <span class="badge badge-warning badge-sm">Estimate</span>
        }
      </div>

      @if (loading()) {
        <div class="flex items-center gap-2 text-sm text-base-content/60">
          <span class="loading loading-spinner loading-xs"></span>
          Loading…
        </div>
      } @else if (margin(); as m) {
        <div class="space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-base-content/70">Net revenue</span>
            <span class="text-tabular">{{ formatCurrency(m.netRevenueCents) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-base-content/70">Cost of goods</span>
            <span class="text-tabular">{{ formatCurrency(m.cogsCents) }}</span>
          </div>
          <div class="flex justify-between font-semibold">
            <span class="text-base-content">Margin</span>
            <span
              class="text-tabular"
              [class.text-success]="m.marginCents > 0"
              [class.text-error]="m.marginCents < 0"
            >
              {{ formatCurrency(m.marginCents) }}
              @if (m.marginPercent !== null) {
                <span class="text-base-content/60 font-normal">
                  ({{ m.marginPercent.toFixed(1) }}%)
                </span>
              }
            </span>
          </div>
        </div>

        @if (!m.reliable && m.unreliableReasons.length > 0) {
          <ul class="mt-2 space-y-0.5">
            @for (reason of m.unreliableReasons; track reason) {
              <li class="text-xs text-warning flex items-center gap-1">
                <ng-icon name="heroExclamationTriangle" size="0.875rem" />
                {{ reasonLabel(reason) }}
              </li>
            }
          </ul>
        }

        @if (canRetry() && m.unreliableReasons.includes('SKIPPED_COGS')) {
          <button
            type="button"
            class="btn btn-outline btn-sm mt-3 gap-1"
            [disabled]="retrying()"
            (click)="retry.emit()"
          >
            @if (retrying()) {
              <span class="loading loading-spinner loading-xs"></span>
              Recalculating…
            } @else {
              <ng-icon name="heroArrowPath" size="1rem" />
              Recalculate cost
            }
          </button>
        }
      } @else {
        <p class="text-sm text-base-content/50">Margin data unavailable.</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderMarginBlockComponent {
  private readonly currencyService = inject(CurrencyService);

  readonly margin = input<OrderMargin | null>(null);
  readonly loading = input<boolean>(false);
  readonly canRetry = input<boolean>(false);
  readonly retrying = input<boolean>(false);

  readonly retry = output<void>();

  formatCurrency(cents: number): string {
    return this.currencyService.format(cents, false);
  }

  reasonLabel(reason: string): string {
    switch (reason) {
      case 'SKIPPED_COGS':
        return 'Cost was not recorded for this order (insufficient stock at sale time).';
      case 'ZERO_COST_BATCH':
        return 'Some items have no recorded cost — margin is overstated.';
      case 'NO_COGS_DATA':
        return 'Cost data missing for this order.';
      default:
        return reason;
    }
  }
}

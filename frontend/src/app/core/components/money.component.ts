import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { AuthService } from '../services/auth.service';
import { CurrencyService } from '../services/currency.service';

/**
 * Canonical money renderer — the single place any monetary amount is shown.
 *
 * Owns three concerns so they can never drift across the app:
 * 1. Currency formatting (input is ALWAYS cents, per CurrencyService).
 * 2. Money-in / money-out direction (green / red), when a direction is given.
 * 3. Permission masking — when `sensitive` is set and the user lacks the
 *    `ViewFinancials` permission, the figure is replaced with a masked
 *    placeholder (••• + lock) instead of being shown.
 *
 * Usage:
 *   <app-money [value]="order.totalWithTax" />
 *   <app-money [value]="line.amount" direction="in" />
 *   <app-money [value]="channelRevenue" [sensitive]="true" />
 *
 * Operational figures (cart totals, the amount a cashier is collecting, a
 * customer's own outstanding, own shift count) leave `sensitive` false so they
 * remain visible to all roles. Business figures (balances, P&L, receivables/
 * payables totals) set `sensitive` so they mask outside the Finances section.
 */
@Component({
  selector: 'app-money',
  standalone: true,
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (masked()) {
      <span
        class="inline-flex items-center gap-1 text-base-content/40 align-middle"
        aria-label="Hidden — requires financial access"
      >
        <ng-icon name="heroLockClosed" size="0.875rem" />
        <span aria-hidden="true">•••</span>
      </span>
    } @else {
      <span [class]="colorClass()">{{ formatted() }}</span>
    }
  `,
})
export class MoneyComponent {
  private readonly currencyService = inject(CurrencyService);
  private readonly authService = inject(AuthService);

  /** Amount in cents (Vendure convention). Null/undefined renders as zero. */
  readonly value = input.required<number | null | undefined>();
  /** Cash-flow direction: 'in' → green, 'out' → red, null → neutral. */
  readonly direction = input<'in' | 'out' | null>(null);
  /** When true, mask the figure unless the user can view financials. */
  readonly sensitive = input<boolean>(false);
  /** Show the currency prefix (e.g. "KES"). */
  readonly showCurrency = input<boolean>(true);

  readonly masked = computed(() => this.sensitive() && !this.authService.canViewFinancials());

  readonly formatted = computed(() =>
    this.currencyService.format(this.value() ?? 0, this.showCurrency()),
  );

  readonly colorClass = computed(() => {
    switch (this.direction()) {
      case 'in':
        return 'text-success';
      case 'out':
        return 'text-error';
      default:
        return '';
    }
  });
}

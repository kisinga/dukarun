import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

@Component({
  selector: 'app-customer-financial-display',
  imports: [],
  template: `
    <div class="flex-1">
      @if (hasBalance()) {
        <div class="font-medium" [class]="balanceColorClass()">
          {{ formatCurrency(outstandingAmountAbs()) }}
          <span class="text-sm font-normal text-base-content/60">{{ balanceLabel() }}</span>
        </div>
      }
      @if (isCreditApproved() && creditLimit() > 0) {
        <div class="text-sm text-base-content/60">
          {{ formatCurrency(availableCredit()) }} / {{ formatCurrency(creditLimit()) }} available
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFinancialDisplayComponent {
  outstandingAmount = input<number>(0);
  creditLimit = input<number>(0);
  availableCredit = input<number>(0);
  isCreditApproved = input<boolean>(false);

  private readonly currencyService = inject(CurrencyService);

  outstandingAmountAbs = computed(() => Math.abs(this.outstandingAmount()));

  hasBalance = computed(() => this.outstandingAmount() !== 0);

  balanceLabel = computed(() => {
    return this.outstandingAmount() < 0 ? 'owed' : 'credit';
  });

  balanceColorClass = computed(() => {
    const amount = this.outstandingAmount();
    if (amount < 0) return 'text-warning';
    if (amount > 0) return 'text-success';
    return '';
  });

  formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }
}

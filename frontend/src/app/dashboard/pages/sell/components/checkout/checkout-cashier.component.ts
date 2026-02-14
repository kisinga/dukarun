import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CheckoutSummaryComponent } from './checkout-summary.component';

@Component({
  selector: 'app-checkout-cashier',
  standalone: true,
  imports: [CommonModule, CheckoutSummaryComponent],
  template: `
    <div class="space-y-4 anim-stagger">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-8 h-8 bg-info/10 rounded-full mb-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-info"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <h4 class="font-bold text-lg sm:text-xl mb-1">Send to Cashier</h4>
      </div>

      <app-checkout-summary
        [itemCount]="itemCount()"
        [total]="total()"
        [totalColor]="'info'"
        [delay]="true"
      />

      <button
        class="btn btn-info btn-md sm:btn-lg w-full hover:scale-105 active:scale-95 transition-transform min-h-[44px]"
        (click)="complete.emit()"
        [disabled]="isProcessing()"
      >
        @if (isProcessing()) {
          <span class="loading loading-spinner"></span>
        } @else {
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        }
        Submit to Cashier
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutCashierComponent {
  readonly itemCount = input.required<number>();
  readonly total = input.required<number>();
  readonly isProcessing = input<boolean>(false);

  readonly complete = output<void>();
}

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { CheckoutSummaryComponent } from './checkout-summary.component';

@Component({
  selector: 'app-checkout-cashier',
  standalone: true,
  imports: [CommonModule, NgIcon, CheckoutSummaryComponent],
  template: `
    <div class="space-y-4 anim-stagger">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-8 h-8 bg-info/10 rounded-full mb-3">
          <ng-icon name="heroClipboardDocument" size="1.25rem" class="text-info" />
        </div>
        <h4 class="font-bold text-lg sm:text-xl mb-1">Send to Cashier</h4>
      </div>

      <app-checkout-summary
        [itemCount]="itemCount()"
        [total]="total()"
        [totalColor]="'info'"
        [delay]="true"
      />

      <div class="flex flex-col sm:flex-row gap-3">
        <button
          class="btn btn-info btn-md sm:btn-lg flex-1 interactive-press min-h-[44px]"
          (click)="complete.emit()"
          [disabled]="isProcessing()"
        >
          @if (isProcessing()) {
            <span class="loading loading-spinner"></span>
          } @else {
            <ng-icon name="heroClipboardDocumentCheck" size="1.25rem" />
          }
          Submit to Cashier
        </button>

        @if (enablePrinter()) {
          <button
            class="btn btn-outline btn-info btn-md sm:btn-lg flex-1 interactive-press min-h-[44px]"
            (click)="completeAndPrint.emit()"
            [disabled]="isProcessing()"
          >
            @if (isProcessing()) {
              <span class="loading loading-spinner"></span>
            } @else {
              <ng-icon name="heroPrinter" size="1.25rem" />
            }
            Submit & Print Slip
          </button>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutCashierComponent {
  readonly itemCount = input.required<number>();
  readonly total = input.required<number>();
  readonly isProcessing = input<boolean>(false);
  readonly enablePrinter = input<boolean>(true);

  readonly complete = output<void>();
  readonly completeAndPrint = output<void>();
}

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OrderFulfillmentInfoInput } from '../order-detail.types';

/**
 * Order Fulfillment Info Component
 *
 * Displays fulfillment details with conditional rendering
 */
@Component({
  selector: 'app-order-fulfillment-info',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hasFulfillments()) {
      <div class="mb-6 hidden-print">
        <h3 class="font-semibold mb-2">Fulfillment</h3>
        @for (fulfillment of fulfillments(); track fulfillment.id) {
          <div class="mb-2">
            <p><strong>Method:</strong> {{ fulfillment.method }}</p>
            @if (fulfillment.trackingCode) {
              <p><strong>Tracking:</strong> {{ fulfillment.trackingCode }}</p>
            }
            <p class="text-sm text-base-content/60">Status: {{ fulfillment.state }}</p>
          </div>
        }
      </div>
    }
  `,
})
export class OrderFulfillmentInfoComponent {
  readonly fulfillments = input<OrderFulfillmentInfoInput['fulfillments']>(null);

  readonly hasFulfillments = computed(() => {
    const fulfills = this.fulfillments();
    return fulfills && fulfills.length > 0;
  });
}

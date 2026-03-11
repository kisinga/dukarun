import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderCustomerInfoInput } from '../order-detail.types';

/**
 * Order Customer Info Component
 *
 * Displays customer name (link to customer detail when not walk-in), email, and phone
 */
@Component({
  selector: 'app-order-customer-info',
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      @if (customer()?.id && !isWalkInCustomer()) {
        <a
          [routerLink]="['/dashboard/customers', customer()!.id]"
          class="link link-hover text-base font-medium text-base-content mb-2 inline-block"
          >{{ customerName() }}</a
        >
      } @else {
        <p class="text-base font-medium text-base-content mb-2">{{ customerName() }}</p>
      }
      @if (showContactInfo()) {
        <div class="space-y-1">
          @if (customer()?.emailAddress) {
            <div class="flex items-center gap-2 text-sm text-base-content/70">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span>{{ customer()!.emailAddress }}</span>
            </div>
          }
          @if (customer()?.phoneNumber) {
            <div class="flex items-center gap-2 text-sm text-base-content/70">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              <span>{{ customer()!.phoneNumber }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class OrderCustomerInfoComponent {
  readonly customer = input<OrderCustomerInfoInput['customer']>(null);

  readonly customerName = computed(() => {
    const cust = this.customer();
    if (!cust) return 'Walk-in Customer';
    const firstName = cust.firstName || '';
    const lastName = cust.lastName || '';
    return `${firstName} ${lastName}`.trim() || 'Walk-in Customer';
  });

  readonly isWalkInCustomer = computed(() => {
    const cust = this.customer();
    if (!cust) return true;
    const email = cust.emailAddress?.toLowerCase() || '';
    const firstName = cust.firstName?.toLowerCase() || '';
    return email === 'walkin@pos.local' || firstName === 'walk-in';
  });

  readonly showContactInfo = computed(() => {
    return !this.isWalkInCustomer();
  });
}

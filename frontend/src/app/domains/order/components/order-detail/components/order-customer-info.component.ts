import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { HoverPreviewHostComponent } from '../../../../../shared/components/dashboard/hover-preview-host/hover-preview-host.component';
import type { OrderCustomerInfoInput } from '../order-detail.types';

/**
 * Order Customer Info Component
 *
 * Displays customer name (link to customer detail when not walk-in), email, and phone.
 * Customer link shows hover preview when available.
 */
@Component({
  selector: 'app-order-customer-info',
  imports: [CommonModule, RouterLink, NgIcon, HoverPreviewHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      @if (customer()?.id && !isWalkInCustomer()) {
        <app-hover-preview-host previewKey="customer" [entityId]="customer()!.id">
          <a
            [routerLink]="['/dashboard/customers', customer()!.id]"
            class="link link-hover text-base font-medium text-base-content mb-2 inline-block"
            >{{ customerName() }}</a
          >
        </app-hover-preview-host>
      } @else {
        <p class="text-base font-medium text-base-content mb-2">{{ customerName() }}</p>
      }
      @if (showContactInfo()) {
        <div class="space-y-1">
          @if (customer()?.emailAddress) {
            <div class="flex items-center gap-2 text-sm text-base-content/70">
              <ng-icon name="heroEnvelope" size="1rem" class="shrink-0" />
              <span>{{ customer()!.emailAddress }}</span>
            </div>
          }
          @if (customer()?.phoneNumber) {
            <div class="flex items-center gap-2 text-sm text-base-content/70">
              <ng-icon name="heroPhone" size="1rem" class="shrink-0" />
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

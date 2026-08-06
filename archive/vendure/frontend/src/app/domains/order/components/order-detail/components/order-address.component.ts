import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OrderAddressInput } from '../order-detail.types';

/**
 * Order Address Component
 *
 * Reusable component for displaying billing or shipping addresses
 */
@Component({
  selector: 'app-order-address',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h3 class="font-semibold mb-2 text-sm text-base-content/70">{{ label() }}</h3>
      @if (address()) {
        <div class="text-sm text-base-content/80 space-y-1">
          <p class="font-medium">{{ displayName() }}</p>
          <p>{{ address()!.streetLine1 }}</p>
          @if (address()!.streetLine2) {
            <p>{{ address()!.streetLine2 }}</p>
          }
          <p>{{ cityAndPostal() }}</p>
          <p>{{ address()!.country }}</p>
        </div>
      } @else {
        <p class="text-sm text-base-content/60">No {{ label().toLowerCase() }}</p>
      }
    </div>
  `,
})
export class OrderAddressComponent {
  readonly address = input<OrderAddressInput['address']>(null);
  readonly label = input.required<string>();
  readonly fallbackName = input<string>('');

  readonly displayName = computed(() => {
    const addr = this.address();
    if (addr?.fullName) return addr.fullName;
    return this.fallbackName() || 'N/A';
  });

  readonly cityAndPostal = computed(() => {
    const addr = this.address();
    if (!addr) return '';
    const parts: string[] = [];
    if (addr.city) parts.push(addr.city);
    if (addr.postalCode) parts.push(addr.postalCode);
    return parts.join(' ').trim() || '';
  });
}

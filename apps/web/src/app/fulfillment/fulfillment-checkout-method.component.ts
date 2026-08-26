import { Component, input, output } from '@angular/core';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import type { CheckoutMode } from './fulfillment-checkout-fields.component';
import type { FulfillmentSettings } from './fulfillment.service';

@Component({
  selector: 'app-fulfillment-checkout-method',
  imports: [ButtonComponent, IconComponent],
  template: `
    @if (settings()?.enabled && settings()?.feature_available) {
      <section class="border-t border-base-300/60 p-4" aria-labelledby="order-method-heading">
        <p id="order-method-heading" class="type-caption">Order method</p>
        <div class="mt-2 grid grid-cols-3 rounded-field bg-base-200 p-1">
          @for (option of modeOptions; track option.value) {
            <button
              appButton
              type="button"
              size="sm"
              [variant]="mode() === option.value ? 'secondary' : 'ghost'"
              [disabled]="!modeEnabled(option.value)"
              (click)="modeSelected.emit(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>

        @if (mode() !== 'counter') {
          <div class="mt-4 border-t border-base-300/60 pt-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-semibold">
                  {{ mode() === 'delivery' ? 'Delivery details' : 'Pickup details' }}
                </p>
                @if (detailsCommitted()) {
                  <p class="mt-1 truncate text-sm">{{ recipientName() }}</p>
                  <p class="type-caption mt-0.5 truncate">
                    @if (mode() === 'delivery') {
                      {{ address() }}
                    } @else {
                      {{ phone() || 'No phone provided' }}
                    }
                  </p>
                } @else {
                  <p class="type-caption mt-1">Recipient details still need attention.</p>
                }
              </div>
              <button
                appButton
                type="button"
                variant="ghost"
                size="sm"
                [iconOnly]="true"
                [attr.aria-label]="detailsCommitted() ? 'Edit order details' : 'Add order details'"
                [title]="detailsCommitted() ? 'Edit details' : 'Add details'"
                (click)="detailsRequested.emit()"
              >
                <app-icon [name]="detailsCommitted() ? 'heroPencilSquare' : 'heroPlus'" />
              </button>
            </div>
            @if (detailsCommitted()) {
              <div class="mt-3 flex flex-wrap gap-2">
                <span class="badge badge-ghost badge-sm">
                  {{ updatesRequested() ? 'Updates on' : 'Updates off' }}
                </span>
                @if (collectionKind() === 'cod') {
                  <span class="badge badge-warning badge-sm">COD</span>
                }
                @if (promiseLabel(); as promise) {
                  <span class="badge badge-ghost badge-sm">{{ promise }}</span>
                }
              </div>
            }
          </div>
        }
      </section>
    }
  `,
})
export class FulfillmentCheckoutMethodComponent {
  readonly settings = input<FulfillmentSettings | null>(null);
  readonly mode = input<CheckoutMode>('counter');
  readonly detailsCommitted = input(false);
  readonly recipientName = input('');
  readonly phone = input('');
  readonly address = input('');
  readonly collectionKind = input<'none' | 'cod'>('none');
  readonly updatesRequested = input(true);
  readonly promiseLabel = input<string | null>(null);
  readonly modeSelected = output<CheckoutMode>();
  readonly detailsRequested = output<void>();

  protected readonly modeOptions: ReadonlyArray<{ value: CheckoutMode; label: string }> = [
    { value: 'counter', label: 'Counter' },
    { value: 'pickup', label: 'Pickup' },
    { value: 'delivery', label: 'Delivery' },
  ];

  protected modeEnabled(mode: CheckoutMode): boolean {
    if (mode === 'pickup') return !!this.settings()?.pickup_enabled;
    if (mode === 'delivery') return !!this.settings()?.delivery_enabled;
    return true;
  }
}

import { Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent } from '../../shared/ui/button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import type { CustomerWithCredit } from '../pos.service';

export interface SellCustomerViewModel {
  selected: CustomerWithCredit | null;
  results: readonly CustomerWithCredit[];
  dropdownOpen: boolean;
  searchExhaustive: boolean;
  searchHasMore: boolean;
  depositBalance: number;
}

export type SellCustomerIntent =
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'clear' }
  | { type: 'select'; customer: CustomerWithCredit };

/** Customer lookup remains presentational; selection and deposit refresh belong to the workflow. */
@Component({
  selector: 'app-sell-customer-context',
  imports: [ReactiveFormsModule, ButtonComponent, IconComponent, MoneyComponent],
  template: `
    <section class="p-4">
      <p class="type-caption">Customer</p>
      @if (viewModel().selected; as customer) {
        <div class="mt-1 flex items-center gap-1">
          <p class="min-w-0 flex-1 truncate font-semibold">{{ customerName(customer) }}</p>
          <button
            appButton
            variant="ghost"
            size="sm"
            [iconOnly]="true"
            type="button"
            aria-label="Clear customer (back to Walk-in)"
            (click)="intent.emit({ type: 'clear' })"
          >
            <app-icon name="heroXMark" />
          </button>
        </div>
        <p class="mt-0.5 text-xs text-base-content/60 sm:text-sm">
          @if (!customer.is_credit_approved) {
            Credit not approved
          } @else if (customer.credit_limit > 0) {
            Limit <app-money [amount]="customer.credit_limit" /> &middot; Owed
            <app-money [amount]="customer.ar_balance" /> &middot; Available
            <app-money [amount]="creditAvailable(customer)" />
          } @else {
            Credit approved &middot; no cap
          }
          @if (viewModel().depositBalance > 0) {
            <span class="block text-success">
              Deposit <app-money [amount]="viewModel().depositBalance" />
            </span>
          }
        </p>
      } @else {
        <div class="relative mt-1">
          <input
            type="search"
            class="input input-bordered min-h-11 w-full"
            placeholder="Walk-in"
            autocomplete="off"
            aria-label="Search customers"
            [formControl]="searchControl()"
            (focus)="intent.emit({ type: 'focus' })"
            (blur)="intent.emit({ type: 'blur' })"
          />
          @if (viewModel().dropdownOpen && viewModel().results.length > 0) {
            <ul
              class="menu absolute inset-x-0 z-20 mt-1 max-h-64 flex-nowrap overflow-y-auto rounded-box border border-base-300/60 bg-base-100 p-1 shadow-overlay"
            >
              @for (customer of viewModel().results; track customer.id) {
                <li>
                  <button
                    type="button"
                    class="min-h-11"
                    (mousedown)="$event.preventDefault(); intent.emit({ type: 'select', customer })"
                  >
                    <span class="min-w-0 flex-1 truncate text-left">{{
                      customerName(customer)
                    }}</span>
                    <span class="text-xs text-base-content/60">{{ customer.phone }}</span>
                    <span class="text-xs" [class.text-error]="!customer.is_credit_approved">
                      @if (!customer.is_credit_approved) {
                        No credit
                      } @else if (customer.credit_limit > 0) {
                        <app-money [amount]="creditAvailable(customer)" /> left
                      } @else {
                        No cap
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
          @if (
            viewModel().dropdownOpen &&
            searchControl().value.trim().length >= 2 &&
            viewModel().results.length === 0
          ) {
            <p class="mt-1 text-xs text-base-content/60">
              {{
                viewModel().searchExhaustive
                  ? 'No customers found'
                  : 'No cached matches - more may be available online'
              }}
            </p>
          } @else if (viewModel().dropdownOpen && !viewModel().searchExhaustive) {
            <p class="mt-1 text-xs text-base-content/60">
              {{
                viewModel().searchHasMore
                  ? 'Refine search for more matches'
                  : 'Cached results may be incomplete'
              }}
            </p>
          }
        </div>
      }
    </section>
  `,
})
export class SellCustomerContextComponent {
  readonly viewModel = input.required<SellCustomerViewModel>();
  readonly searchControl = input.required<FormControl<string>>();
  readonly intent = output<SellCustomerIntent>();

  protected customerName(customer: CustomerWithCredit): string {
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  }

  protected creditAvailable(customer: CustomerWithCredit): number {
    return Math.max(0, customer.credit_limit - customer.ar_balance);
  }
}

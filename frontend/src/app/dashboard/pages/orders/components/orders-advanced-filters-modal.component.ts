import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrdersListFilterService } from '../services/orders-list-filter.service';

/**
 * Advanced filters modal for the orders list.
 * Only depends on OrdersListFilterService; Apply/Clear update the service and close.
 */
@Component({
  selector: 'app-orders-advanced-filters-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="modal modal-bottom sm:modal-middle" (click)="onBackdropClick($event)">
      <div
        class="modal-box max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-base-300">
          <h3 class="text-lg font-bold text-base-content">Advanced filters</h3>
          <form method="dialog">
            <button class="btn btn-sm btn-circle btn-ghost" type="submit" aria-label="Close">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </form>
        </div>

        <div class="space-y-4">
          <div class="form-control">
            <label class="label" for="af-date-from">
              <span class="label-text">Date from</span>
            </label>
            <input
              id="af-date-from"
              type="date"
              class="input input-bordered input-sm w-full"
              [value]="localDateFrom()"
              (input)="localDateFrom.set($any($event.target).value)"
            />
          </div>
          <div class="form-control">
            <label class="label" for="af-date-to">
              <span class="label-text">Date to</span>
            </label>
            <input
              id="af-date-to"
              type="date"
              class="input input-bordered input-sm w-full"
              [value]="localDateTo()"
              (input)="localDateTo.set($any($event.target).value)"
            />
          </div>
          <div class="form-control">
            <label class="label" for="af-state">
              <span class="label-text">State</span>
            </label>
            <select
              id="af-state"
              class="select select-bordered select-sm w-full"
              [value]="localState()"
              (change)="localState.set($any($event.target).value)"
            >
              <option value="">All States</option>
              <option value="Draft">Draft</option>
              <option value="ArrangingPayment">Unpaid</option>
              <option value="PaymentSettled">Paid</option>
            </select>
          </div>
        </div>

        <div class="flex gap-2 mt-6 justify-end">
          <button type="button" class="btn btn-ghost btn-sm" (click)="onClear()">Clear</button>
          <button type="button" class="btn btn-primary btn-sm" (click)="onApply()">Apply</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  `,
})
export class OrdersAdvancedFiltersModalComponent {
  private readonly filterService = inject(OrdersListFilterService);

  isOpen = input<boolean>(false);
  closed = output<void>();

  dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  readonly localDateFrom = signal<string | null>(null);
  readonly localDateTo = signal<string | null>(null);
  readonly localState = signal<string>('');

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const d = this.dialog()?.nativeElement;
      if (!d) return;
      if (open) {
        this.localDateFrom.set(this.filterService.dateFrom());
        this.localDateTo.set(this.filterService.dateTo());
        this.localState.set(this.filterService.stateFilter());
        const onClose = () => {
          d.removeEventListener('close', onClose);
          this.closed.emit();
        };
        d.addEventListener('close', onClose);
        d.showModal();
      } else {
        d.close();
      }
    });
  }

  onApply(): void {
    this.filterService.setFilters({
      dateFrom: this.localDateFrom() || null,
      dateTo: this.localDateTo() || null,
      stateFilter: this.localState(),
    });
    this.dialog()?.nativeElement?.close();
    this.closed.emit();
  }

  onClear(): void {
    this.filterService.clearFilters();
    this.dialog()?.nativeElement?.close();
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).tagName === 'DIALOG') {
      this.dialog()?.nativeElement?.close();
      this.closed.emit();
    }
  }
}

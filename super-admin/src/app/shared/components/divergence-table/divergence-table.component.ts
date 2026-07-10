import { Component, input, output } from '@angular/core';

export interface DivergenceColumn<T> {
  header: string;
  align?: 'left' | 'right';
  value: (item: T) => string;
  badgeClass?: (item: T) => string;
}

@Component({
  selector: 'app-divergence-table',
  standalone: true,
  template: `
    @if (loading()) {
      <div class="flex items-center gap-2 text-base-content/70">
        <span class="loading loading-spinner loading-md"></span>
        <span>Loading…</span>
      </div>
    }
    @if (error()) {
      <div role="alert" class="alert alert-error mb-4">
        <span>{{ error() }}</span>
      </div>
    }

    @if (items().length) {
      <div class="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow">
        <table class="table table-zebra">
          <thead>
            <tr>
              @for (col of columns(); track col.header) {
                <th [class.text-right]="col.align === 'right'">{{ col.header }}</th>
              }
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (item of items(); track trackBy()(item)) {
              <tr>
                @for (col of columns(); track col.header) {
                  <td [class.text-right]="col.align === 'right'" [class.font-mono]="col.align === 'right'">
                    @if (col.badgeClass) {
                      <span class="badge badge-sm" [class]="col.badgeClass(item)">{{ col.value(item) }}</span>
                    } @else {
                      {{ col.value(item) }}
                    }
                  </td>
                }
                <td>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="reconcile.emit(item)">Reconcile</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="text-sm text-base-content/60 mt-2">{{ countLabel() }}</p>
    } @else if (!loading()) {
      <div class="p-6 rounded-xl border border-base-300 bg-base-100 text-base-content/70">
        {{ emptyMessage() }}
      </div>
    }
  `,
})
export class DivergenceTableComponent<T> {
  loading = input.required<boolean>();
  error = input<string | null>(null);
  items = input.required<T[]>();
  columns = input.required<DivergenceColumn<T>[]>();
  emptyMessage = input.required<string>();
  countLabel = input.required<string>();
  trackBy = input.required<(item: T) => string>();

  reconcile = output<T>();
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface AnalyticsTableRow {
  rank: number;
  productName: string;
  variantName: string | null;
  displayValue: string;
  productId?: string;
}

/**
 * Table of analytics results (ranking or sales). Reuses products-table styling.
 * Used for "Top by value" and sales cards (Trending, Top Selling, etc.).
 */
@Component({
  selector: 'app-analytics-results-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
      <div class="px-4 py-3 border-b border-base-300/60">
        <h2 class="text-sm font-bold text-base-content/70">{{ title() }}</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th class="w-12 text-right">#</th>
              <th>Product</th>
              <th>Variant</th>
              <th class="text-right">{{ valueColumnLabel() }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.rank) {
              <tr class="hover" [class.cursor-pointer]="row.productId">
                <td class="text-right tabular-nums text-base-content/60">{{ row.rank }}</td>
                <td>
                  @if (row.productId) {
                    <a
                      [routerLink]="'/dashboard/products/' + row.productId"
                      class="font-medium link link-hover text-primary"
                    >
                      {{ row.productName }}
                    </a>
                  } @else {
                    <span class="font-medium">{{ row.productName }}</span>
                  }
                </td>
                <td class="text-base-content/70">{{ row.variantName ?? '—' }}</td>
                <td class="text-right tabular-nums font-medium">{{ row.displayValue }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  imports: [RouterLink],
})
export class AnalyticsResultsTableComponent {
  readonly title = input.required<string>();
  readonly valueColumnLabel = input.required<string>();
  readonly rows = input<AnalyticsTableRow[]>([]);
}

import { Component, input } from '@angular/core';

@Component({
  selector: 'app-data-coverage-badge',
  template: `
    <span
      class="badge badge-sm"
      [class.badge-success]="quality() === 'reconciled'"
      [class.badge-info]="quality() === 'exact'"
      [class.badge-ghost]="quality() === 'estimated'"
    >
      {{
        quality() === 'reconciled' ? 'Reconciled' : quality() === 'exact' ? 'Exact' : 'Estimated'
      }}
    </span>
  `,
})
export class DataCoverageBadgeComponent {
  readonly quality = input.required<'estimated' | 'exact' | 'reconciled'>();
}

import { ChangeDetectionStrategy, Component, model } from '@angular/core';

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '1y';

const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '1y', label: '1Y' },
];

@Component({
  selector: 'app-period-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-base-200 rounded-lg overflow-x-auto">
      <div role="tablist" class="tabs tabs-box tabs-sm">
        @for (p of periods; track p.key) {
          <button
            role="tab"
            class="tab font-semibold"
            [class.tab-active]="selected() === p.key"
            (click)="selected.set(p.key)"
          >
            {{ p.label }}
          </button>
        }
      </div>
    </div>
  `,
})
export class PeriodSelectorComponent {
  selected = model<AnalyticsPeriod>('30d');
  readonly periods = PERIODS;
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { StatCardComponent } from '../../../components/shared/stat-card.component';
import { StatStripComponent } from '../../../components/shared/stat-strip.component';

export interface CustomerStats {
  totalCustomers: number;
  verifiedCustomers: number;
  creditApprovedCustomers: number;
  frozenCustomers: number;
  recentCustomers: number;
}

/**
 * Customer KPI strip.
 *
 * Routes through the shared <app-stat-card>/<app-stat-strip> (design-spec
 * hierarchy: value is the hero, semantic colour only where it means something —
 * verified=success, frozen=error; a plain total stays neutral). The three
 * meaningful states are interactive filters with an active-ring signifier.
 */
@Component({
  selector: 'app-customer-stats',
  standalone: true,
  imports: [StatCardComponent, StatStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-stat-strip [cols]="4">
      <app-stat-card label="Customers" [value]="stats().totalCustomers" icon="heroUsers" />
      <app-stat-card
        label="Verified"
        [value]="stats().verifiedCustomers"
        tone="success"
        icon="heroCheckBadge"
        [interactive]="true"
        [active]="!!activeFilters().verified"
        (select)="onFilterClick('verified')"
      />
      <app-stat-card
        label="Credit"
        [value]="stats().creditApprovedCustomers"
        tone="primary"
        icon="heroCreditCard"
        [interactive]="true"
        [active]="!!activeFilters().creditApproved"
        (select)="onFilterClick('creditApproved')"
      />
      <app-stat-card
        label="Frozen"
        [value]="stats().frozenCustomers"
        tone="error"
        icon="heroLockClosed"
        [interactive]="true"
        [active]="!!activeFilters().frozen"
        (select)="onFilterClick('frozen')"
      />
    </app-stat-strip>
  `,
})
export class CustomerStatsComponent {
  readonly stats = input.required<CustomerStats>();
  readonly activeFilters = input<{
    verified?: boolean;
    creditApproved?: boolean;
    frozen?: boolean;
    recent?: boolean;
  }>({});
  readonly filterClick = output<{ type: string; color: string }>();

  onFilterClick(type: string): void {
    const colorMap: Record<string, string> = {
      verified: 'success',
      creditApproved: 'primary',
      frozen: 'error',
      recent: 'warning',
    };
    this.filterClick.emit({ type, color: colorMap[type] || 'primary' });
  }
}

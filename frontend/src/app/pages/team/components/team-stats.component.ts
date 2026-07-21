import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  StatBarComponent,
  type StatItem,
} from '../../../shared/components/dashboard/stat-bar.component';

export interface TeamStats {
  total: number;
  verified: number;
  byRole: Record<string, number>;
}

/**
 * Team summary — a compact inline stat line. Verification state carries the
 * colour (verified=success, pending=warning); totals and role counts stay
 * neutral. No interactive filters — the page has none.
 */
@Component({
  selector: 'app-team-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" />`,
})
export class TeamStatsComponent {
  readonly stats = input.required<TeamStats>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    const pending = s.total - s.verified;
    const roles = Object.entries(s.byRole).map(([code, count]) => ({
      label: code.toLowerCase(),
      value: count,
    }));
    return [
      { label: 'members', value: s.total },
      { label: 'verified', value: s.verified, tone: 'success' },
      { label: 'pending', value: pending, tone: 'warning' },
      ...roles,
    ];
  });
}

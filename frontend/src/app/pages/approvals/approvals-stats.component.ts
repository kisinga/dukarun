import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  StatBarComponent,
  type StatItem,
} from '../../shared/components/dashboard/stat-bar.component';

/**
 * Approval summary — a compact inline stat line. "pending" needs action
 * (warning); approved/rejected reflect the currently loaded list. The
 * stat-bar zero-guard neutralises tones at 0, so no per-item guards here.
 */
@Component({
  selector: 'app-approvals-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" />`,
})
export class ApprovalsStatsComponent {
  readonly pending = input.required<number>();
  readonly approved = input.required<number>();
  readonly rejected = input.required<number>();

  readonly items = computed<StatItem[]>(() => [
    { label: 'pending', value: this.pending(), tone: 'warning' },
    { label: 'approved', value: this.approved(), tone: 'success' },
    { label: 'rejected', value: this.rejected(), tone: 'error' },
  ]);
}

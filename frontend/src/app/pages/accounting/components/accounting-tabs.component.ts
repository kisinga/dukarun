import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

export type TabType = 'overview' | 'accounts' | 'transactions' | 'reconciliation';

const TABS: { path: TabType; label: string }[] = [
  { path: 'overview', label: 'Overview' },
  { path: 'accounts', label: 'Accounts' },
  { path: 'transactions', label: 'Transactions' },
  { path: 'reconciliation', label: 'Reconciliation' },
];

@Component({
  selector: 'app-accounting-tabs',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './accounting-tabs.component.html',
  styleUrl: './accounting-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingTabsComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly tabs = TABS;
  private readonly queryParams = toSignal(this.route.queryParams, {
    initialValue: {},
  });
  protected isTabActive(path: TabType): boolean {
    const params = this.queryParams() as Record<string, string>;
    const tab = params?.['tab'];
    return (tab ?? 'overview') === path;
  }
}

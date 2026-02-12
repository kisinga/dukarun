import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

export type AdminTabPermission = 'ManageStockAdjustments' | null;

export interface AdminTab {
  path: string;
  label: string;
  /** If set, tab is visible only when user has this permission (in addition to UpdateSettings). */
  permission: AdminTabPermission;
}

const ADMIN_TABS: AdminTab[] = [
  { path: 'general', label: 'General', permission: null },
  { path: 'shifts', label: 'Shifts', permission: null },
  { path: 'audit-trail', label: 'Audit Trail', permission: null },
  { path: 'subscription', label: 'Subscription', permission: null },
  { path: 'ml-model', label: 'ML Model', permission: null },
  { path: 'payment-methods', label: 'Payment Methods', permission: null },
  { path: 'team', label: 'Team', permission: null },
];

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {
  private readonly authService = inject(AuthService);

  /** Tabs visible to the current user (section is gated by UpdateSettings; some tabs require extra permission). */
  protected readonly visibleTabs = computed(() => {
    const tabs = ADMIN_TABS;
    return tabs.filter((tab) => {
      if (tab.permission === 'ManageStockAdjustments') {
        return this.authService.hasManageStockAdjustmentsPermission();
      }
      return true;
    });
  });
}

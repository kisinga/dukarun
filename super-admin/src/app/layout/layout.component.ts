import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { NavIconComponent } from '../shared/components/nav-icon';
import type { NavItem, NavSection } from './nav.types';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NavIconComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  readonly auth = inject(AuthService);

  protected readonly overviewItem: NavItem = {
    label: 'Dashboard',
    icon: 'overview',
    route: '/dashboard',
  };

  protected readonly navSections: NavSection[] = [
    {
      label: 'Platform',
      items: [
        { label: 'Channels', icon: 'channels', route: '/channels' },
        { label: 'Users', icon: 'users', route: '/users' },
        { label: 'Platform data', icon: 'platform-data', route: '/platform-data' },
        { label: 'Login attempts', icon: 'login-attempts', route: '/login-attempts' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { label: 'Permission templates', icon: 'role-templates', route: '/role-templates' },
        { label: 'Pending', icon: 'pending', route: '/pending-registrations' },
        { label: 'Subscription Tiers', icon: 'subscription-tiers', route: '/subscription-tiers' },
        { label: 'ML Trainer', icon: 'ml-trainer', route: '/ml-trainer' },
      ],
    },
  ];

  closeDrawer(): void {
    const el = document.getElementById('sa-drawer') as HTMLInputElement | null;
    if (el) el.checked = false;
  }
}

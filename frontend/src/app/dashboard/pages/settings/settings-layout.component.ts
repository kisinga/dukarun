import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

const SETTINGS_TABS: { path: string; label: string }[] = [
  { path: 'notifications', label: 'Notifications' },
  { path: 'test-notifications', label: 'Test Notifications' },
];

@Component({
  selector: 'app-settings-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './settings-layout.component.html',
  styleUrl: './settings-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsLayoutComponent {
  protected readonly tabs = SETTINGS_TABS;
}

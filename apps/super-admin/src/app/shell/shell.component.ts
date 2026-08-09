import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { AuthService } from '../core/auth.service';

function initialDarkTheme(): boolean {
  const saved = localStorage.getItem('dukarun-theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  return dark;
}

/** Staff console shell. Mirrors the responsive drawer language of the tenant app. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  template: `
    <div class="drawer lg:drawer-open">
      <input id="platform-drawer" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content flex min-h-screen min-w-0 flex-col">
        <header class="navbar sticky top-0 z-40 min-h-16 border-b border-base-300 bg-base-100 px-4">
          <label
            for="platform-drawer"
            class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11 lg:hidden"
            aria-label="Open navigation"
          >
            <ng-icon name="heroBars3" size="1.25rem" />
          </label>
          <div class="min-w-0 flex-1 px-2 lg:px-0">
            <p class="truncate text-sm font-semibold lg:hidden">Platform console</p>
            <p class="hidden type-caption lg:block">
              Internal staff tooling — actions here affect live tenants.
            </p>
          </div>
          <button
            type="button"
            class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11"
            [title]="dark() ? 'Use light theme' : 'Use dark theme'"
            [attr.aria-label]="dark() ? 'Use light theme' : 'Use dark theme'"
            (click)="toggleTheme()"
          >
            <ng-icon [name]="dark() ? 'heroSun' : 'heroMoon'" />
          </button>
        </header>
        <main class="dashboard-main flex-1 overflow-auto bg-base-200/40 p-4 lg:p-6">
          <router-outlet />
        </main>
      </div>

      <div class="drawer-side z-50">
        <label
          for="platform-drawer"
          class="drawer-overlay bg-base-content/50"
          aria-label="Close navigation"
        ></label>
        <aside class="flex min-h-screen w-64 flex-col border-r border-base-300 bg-base-200">
          <div class="flex min-h-16 items-center gap-3 border-b border-base-300 px-4">
            <img src="/assets/logo/dukarun-icon.svg" alt="" class="h-9 w-9" />
            <div class="min-w-0">
              <p class="truncate text-sm font-bold">Dukarun</p>
              <p class="type-caption">Platform administration</p>
            </div>
          </div>
          <nav class="flex-1 space-y-1 overflow-y-auto px-2 py-3">
            @for (item of nav; track item.route) {
              <a
                [routerLink]="item.route"
                routerLinkActive="nav-item-active"
                [routerLinkActiveOptions]="{ exact: item.route === '/' }"
                class="nav-item"
                (click)="closeDrawer()"
              >
                <ng-icon [name]="item.icon" />
                <span>{{ item.label }}</span>
              </a>
            }
          </nav>
          <div class="border-t border-base-300 p-2">
            <button class="nav-item w-full" (click)="signOut()">
              <ng-icon name="heroArrowRightOnRectangle" />
              <span>Sign out</span>
            </button>
            <div class="mt-1 text-center type-caption">Internal console</div>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly dark = signal(initialDarkTheme());
  protected readonly nav = [
    { route: '/', label: 'Dashboard', icon: 'heroHome' },
    { route: '/companies', label: 'Companies', icon: 'heroBuildingOffice2' },
    { route: '/tiers', label: 'Subscription tiers', icon: 'heroChartBar' },
    { route: '/communications', label: 'Communications', icon: 'heroChatBubbleLeftRight' },
    { route: '/operations', label: 'Operations', icon: 'heroServerStack' },
    { route: '/audit', label: 'Audit log', icon: 'heroClipboardDocumentList' },
    { route: '/legal', label: 'Legal documents', icon: 'heroDocumentText' },
  ];

  protected closeDrawer(): void {
    const toggle = document.getElementById('platform-drawer') as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }

  protected toggleTheme(): void {
    this.dark.update(value => !value);
    const theme = this.dark() ? 'dark' : 'light';
    document.documentElement.dataset['theme'] = theme;
    localStorage.setItem('dukarun-theme', theme);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}

import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';

function initialDarkTheme(): boolean {
  const saved = localStorage.getItem('dukarun-theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  return dark;
}

/** Staff console shell. A quieter, clearly separated workspace for high-impact actions. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  template: `
    <div class="drawer lg:drawer-open">
      <input id="platform-drawer" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content flex min-h-screen min-w-0 flex-col">
        <header
          class="console-topbar sticky top-0 z-40 flex min-h-[4.5rem] items-center gap-2 border-b border-base-300/70 bg-base-100/95 px-4 backdrop-blur-md lg:px-7"
        >
          <label
            for="platform-drawer"
            class="btn btn-square btn-ghost btn-sm min-h-11 min-w-11 lg:hidden"
            aria-label="Open navigation"
          >
            <ng-icon name="heroBars3" size="1.25rem" />
          </label>
          <div class="min-w-0 flex-1 px-2 lg:px-0">
            <p class="truncate text-sm font-semibold">{{ currentSection() }}</p>
            <p class="hidden type-caption sm:block">Dukarun platform workspace</p>
          </div>
          <div
            class="hidden items-center gap-2 rounded-full border border-success/20 bg-success/8 px-3 py-1.5 text-xs font-semibold text-success sm:flex"
          >
            <span class="size-1.5 rounded-full bg-success"></span>
            Live environment
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
        <main class="dashboard-main flex-1 overflow-auto p-4 sm:p-5 lg:p-8">
          <router-outlet />
        </main>
      </div>

      <div class="drawer-side z-50">
        <label
          for="platform-drawer"
          class="drawer-overlay bg-base-content/50"
          aria-label="Close navigation"
        ></label>
        <aside
          class="console-sidebar flex min-h-screen w-[17rem] flex-col border-r border-base-300/70 bg-base-100"
        >
          <div class="flex min-h-[4.5rem] items-center gap-3 border-b border-base-300/70 px-4">
            <span class="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <img src="/assets/logo/dukarun-icon.svg" alt="" class="h-7 w-7" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-[0.9375rem] font-bold tracking-tight">Dukarun</p>
              <p class="type-caption">Superadmin console</p>
            </div>
          </div>
          <nav class="flex-1 overflow-y-auto px-3 py-5" aria-label="Platform navigation">
            @for (group of navGroups; track group.label) {
              <div class="mb-5 last:mb-0">
                <p class="nav-group-label">{{ group.label }}</p>
                <div class="mt-1.5 space-y-1">
                  @for (item of group.items; track item.route) {
                    <a
                      [routerLink]="item.route"
                      routerLinkActive="nav-item-active"
                      [routerLinkActiveOptions]="{ exact: item.route === '/' }"
                      class="nav-item"
                      (click)="closeDrawer()"
                    >
                      <span class="nav-item-icon"><ng-icon [name]="item.icon" /></span>
                      <span>{{ item.label }}</span>
                    </a>
                  }
                </div>
              </div>
            }
          </nav>
          <div class="border-t border-base-300/70 p-3">
            <div class="mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5">
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral text-xs font-bold text-neutral-content"
                >{{ adminInitial() }}</span
              >
              <span class="min-w-0 flex-1">
                <strong class="block truncate text-xs font-semibold">Platform admin</strong>
                <span class="type-caption block truncate">{{ adminEmail() }}</span>
              </span>
              <button
                class="btn btn-square btn-ghost btn-sm"
                title="Sign out"
                aria-label="Sign out"
                (click)="signOut()"
              >
                <ng-icon name="heroArrowRightOnRectangle" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly dark = signal(initialDarkTheme());
  protected readonly currentSection = signal('Platform dashboard');
  protected readonly navGroups = [
    {
      label: 'Overview',
      items: [{ route: '/', label: 'Dashboard', icon: 'heroHome' }],
    },
    {
      label: 'Business',
      items: [
        { route: '/companies', label: 'Companies', icon: 'heroBuildingOffice2' },
        { route: '/tiers', label: 'Subscription tiers', icon: 'heroChartBar' },
        { route: '/sales', label: 'Sales', icon: 'heroUserGroup' },
        { route: '/tax', label: 'VAT catalog', icon: 'heroDocumentText' },
        { route: '/mpesa', label: 'M-PESA', icon: 'heroServerStack' },
      ],
    },
    {
      label: 'Engagement',
      items: [
        { route: '/communications', label: 'Communications', icon: 'heroChatBubbleLeftRight' },
        { route: '/blog', label: 'Editorial', icon: 'heroNewspaper' },
      ],
    },
    {
      label: 'Governance',
      items: [
        { route: '/operations', label: 'Operations', icon: 'heroServerStack' },
        { route: '/audit', label: 'Audit log', icon: 'heroClipboardDocumentList' },
        { route: '/legal', label: 'Legal documents', icon: 'heroShieldCheck' },
      ],
    },
  ];

  constructor() {
    this.updateSection(this.router.url);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => this.updateSection(event.urlAfterRedirects));
  }

  protected adminEmail(): string {
    return this.auth.session()?.user.email ?? 'Secure session';
  }

  protected adminInitial(): string {
    return this.adminEmail().charAt(0).toUpperCase() || 'A';
  }

  private updateSection(url: string): void {
    const path = url.split('?')[0].replace(/\/$/, '') || '/';
    const item = this.navGroups.flatMap(group => group.items).find(entry => entry.route === path);
    this.currentSection.set(
      item?.label === 'Dashboard' ? 'Platform dashboard' : (item?.label ?? 'Platform console')
    );
  }

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

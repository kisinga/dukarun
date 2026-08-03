import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

/** Staff console shell: navbar + sidebar (no drawer needed — desktop-first). */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex min-h-screen bg-base-200">
      <aside class="flex w-60 shrink-0 flex-col border-r border-base-300 bg-base-100">
        <div class="flex min-h-16 items-center border-b border-base-300 px-4">
          <span class="text-sm font-bold">Dukarun Platform</span>
        </div>
        <nav class="flex-1 space-y-1 px-2 py-2">
          @for (item of nav; track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="nav-item-active"
              [routerLinkActiveOptions]="{ exact: item.route === '/' }"
              class="nav-item"
            >
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="border-t border-base-300 p-2">
          <button class="nav-item w-full" (click)="signOut()">Sign out</button>
          <div class="mt-1 text-center text-xs text-base-content/30">platform console</div>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="navbar sticky top-0 z-40 min-h-16 border-b border-base-300 bg-base-100 px-4">
          <span class="type-caption"
            >Internal staff tooling — actions here mutate live tenants.</span
          >
        </div>
        <main class="dashboard-main flex-1 overflow-auto p-4 lg:p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly nav = [
    { route: '/', label: 'Dashboard' },
    { route: '/companies', label: 'Companies' },
    { route: '/tiers', label: 'Tiers' },
    { route: '/operations', label: 'Operations' },
    { route: '/audit', label: 'Audit log' },
  ];

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}

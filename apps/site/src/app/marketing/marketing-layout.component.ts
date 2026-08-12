import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IconComponent } from '../shared/ui/icon.component';
import { appUrl } from '../core/public-url';

interface NavLink {
  readonly label: string;
  readonly path: string;
  readonly fragment?: string;
}

/**
 * Public marketing layout with a sticky navbar and footer for the unauthenticated
 * pages (/, /about, /contact). Deliberately separate from the dashboard shell:
 * no sidebar, no bottom nav, no tenant state.
 */
@Component({
  selector: 'app-marketing-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col bg-base-100 text-base-content">
      <!-- Navbar -->
      <header class="sticky top-0 z-40 border-b border-base-300/60 bg-base-100/90 backdrop-blur">
        <nav class="mkt-container flex h-16 items-center gap-3">
          <a routerLink="/" class="flex min-h-11 items-center gap-2 font-bold tracking-tight">
            <img src="assets/logo/dukarun-icon-dark.svg" alt="" class="h-7 w-7" />
            <span class="text-lg">dukarun</span>
          </a>

          <div class="ml-auto hidden items-center gap-1 md:flex">
            @for (link of links; track link.path) {
              <a
                [routerLink]="link.path"
                [fragment]="link.fragment"
                routerLinkActive="text-primary"
                [routerLinkActiveOptions]="linkActiveOptions"
                class="flex min-h-11 items-center rounded-field px-3 text-sm font-medium text-base-content/70 transition-colors hover:text-base-content"
              >
                {{ link.label }}
              </a>
            }
          </div>

          <div class="ml-auto flex items-center gap-2 md:ml-4">
            <a
              [href]="appUrl('/login')"
              class="btn btn-ghost btn-sm hidden min-h-11 sm:inline-flex"
            >
              Log in
            </a>
            <a [href]="appUrl('/register')" class="btn btn-primary btn-sm min-h-11">
              Get started
              <app-icon name="heroArrowRight" size="sm" />
            </a>
            <button
              type="button"
              class="btn btn-ghost btn-square min-h-11 min-w-11 md:hidden"
              [attr.aria-expanded]="menuOpen()"
              aria-label="Toggle menu"
              (click)="menuOpen.set(!menuOpen())"
            >
              <app-icon [name]="menuOpen() ? 'heroXMark' : 'heroBars3'" size="lg" />
            </button>
          </div>
        </nav>

        <!-- Mobile menu -->
        @if (menuOpen()) {
          <div class="border-t border-base-300/60 bg-base-100 md:hidden">
            <div class="mkt-container flex flex-col py-2">
              @for (link of links; track link.path) {
                <a
                  [routerLink]="link.path"
                  [fragment]="link.fragment"
                  routerLinkActive="text-primary"
                  [routerLinkActiveOptions]="linkActiveOptions"
                  class="flex min-h-11 items-center rounded-field px-3 text-sm font-medium text-base-content/80"
                  (click)="menuOpen.set(false)"
                >
                  {{ link.label }}
                </a>
              }
              <a
                [href]="appUrl('/login')"
                class="flex min-h-11 items-center rounded-field px-3 text-sm font-medium text-base-content/80"
                (click)="menuOpen.set(false)"
              >
                Log in
              </a>
            </div>
          </div>
        }
      </header>

      <!-- Page -->
      <main class="flex-1">
        <router-outlet />
      </main>

      <!-- Footer -->
      <footer class="border-t border-base-300/60 bg-base-200/50">
        <div class="mkt-container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div class="flex flex-col gap-2">
            <span class="flex items-center gap-2 font-bold tracking-tight">
              <img src="assets/logo/dukarun-icon-dark.svg" alt="" class="h-6 w-6" />
              dukarun
            </span>
            <p class="mb-0 max-w-xs text-sm text-base-content/70">
              Point of sale and books for Kenyan businesses. Sell online or off; every shilling
              lands in the ledger.
            </p>
          </div>
          <nav class="flex flex-col gap-1" aria-label="Pages">
            <span class="mkt-eyebrow mb-1">Pages</span>
            @for (link of links; track link.path) {
              <a
                [routerLink]="link.path"
                [fragment]="link.fragment"
                class="flex min-h-8 items-center text-sm text-base-content/70 hover:text-base-content"
              >
                {{ link.label }}
              </a>
            }
          </nav>
          <nav class="flex flex-col gap-1" aria-label="Resources">
            <span class="mkt-eyebrow mb-1">Resources</span>
            @for (link of resourceLinks; track link.path) {
              <a
                [routerLink]="link.path"
                class="flex min-h-8 items-center text-sm text-base-content/70 hover:text-base-content"
              >
                {{ link.label }}
              </a>
            }
            <a
              [href]="appUrl('/register')"
              class="flex min-h-8 items-center text-sm text-base-content/70 hover:text-base-content"
            >
              Get started
            </a>
            <a
              [href]="appUrl('/login')"
              class="flex min-h-8 items-center text-sm text-base-content/70 hover:text-base-content"
            >
              Log in
            </a>
          </nav>
          <nav class="flex flex-col gap-1" aria-label="Legal">
            <span class="mkt-eyebrow mb-1">Legal</span>
            <a
              routerLink="/privacy"
              class="flex min-h-8 items-center text-sm text-base-content/70 hover:text-base-content"
              >Privacy</a
            >
            <a
              routerLink="/terms"
              class="flex min-h-8 items-center text-sm text-base-content/70 hover:text-base-content"
              >Terms</a
            >
            <a
              routerLink="/dpa"
              class="flex min-h-8 items-center text-sm text-base-content/70 hover:text-base-content"
              >Data Processing Addendum</a
            >
            <a
              routerLink="/subprocessors"
              class="flex min-h-8 items-center text-sm text-base-content/70 hover:text-base-content"
              >Subprocessors</a
            >
          </nav>
        </div>
        <div class="border-t border-base-300/60">
          <div
            class="mkt-container flex flex-col gap-1 py-4 text-xs text-base-content/60 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>© {{ year }} Dukarun. Made for the duka.</span>
            <span>Nairobi, Kenya</span>
          </div>
        </div>
      </footer>
    </div>
  `,
})
export class MarketingLayoutComponent {
  protected readonly appUrl = appUrl;
  protected readonly linkActiveOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'exact',
  } as const;
  protected readonly year = new Date().getFullYear();
  protected readonly menuOpen = signal(false);
  protected readonly links: NavLink[] = [
    { label: 'Home', path: '/' },
    { label: 'Pricing', path: '/', fragment: 'pricing' },
    { label: 'Blog', path: '/blog' },
    { label: 'About', path: '/about' },
    { label: 'Contact', path: '/contact' },
  ];
  protected readonly resourceLinks: NavLink[] = [
    { label: 'Getting started', path: '/docs' },
    { label: 'Hardware setup', path: '/docs/hardware' },
  ];
}

import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { WorkspaceKey, WorkspaceNavigationService } from '../../core/workspace-navigation.service';

@Component({
  selector: 'app-workspace-navigation',
  imports: [RouterLink, RouterLinkActive],
  template: `
    @if (items().length === 1) {
      <div class="mb-4 md:hidden" aria-label="Current view">
        <p class="text-xs font-semibold uppercase tracking-wide text-base-content/55">
          {{ label() }} view
        </p>
        <p class="mt-1 text-sm font-semibold text-base-content">{{ activeItem()?.label }}</p>
      </div>
    } @else if (items().length > 1) {
      <label class="form-control mb-4 md:hidden">
        <span
          class="label-text mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60"
        >
          {{ label() }} view
        </span>
        <select
          class="select select-bordered min-h-11 w-full"
          [attr.aria-label]="label() + ' view'"
          [value]="activeRoute()"
          (change)="navigateSection($event)"
        >
          @for (item of items(); track item.route) {
            <option [value]="item.route">{{ item.label }}</option>
          }
        </select>
      </label>
      <nav
        class="mb-4 hidden border-b border-base-300/70 md:block"
        [attr.aria-label]="label() + ' views'"
      >
        <div role="tablist" class="-mb-px flex gap-1 overflow-x-auto">
          @for (item of items(); track item.route) {
            <a
              role="tab"
              class="flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors hover:text-base-content"
              [class.border-primary]="activeRoute() === item.route"
              [class.border-transparent]="activeRoute() !== item.route"
              [class.text-base-content]="activeRoute() === item.route"
              [class.text-base-content/60]="activeRoute() !== item.route"
              [routerLink]="item.route"
              [attr.aria-selected]="activeRoute() === item.route"
              routerLinkActive
              ariaCurrentWhenActive="page"
            >
              {{ item.label }}
            </a>
          }
        </div>
      </nav>
    }
  `,
})
export class WorkspaceNavigationComponent {
  private readonly navigationService = inject(WorkspaceNavigationService);
  private readonly router = inject(Router);
  private readonly navigation = toSignal(
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)),
    { initialValue: null }
  );

  readonly workspace = input.required<WorkspaceKey>();
  readonly label = input.required<string>();
  protected readonly items = computed(() => this.navigationService.items(this.workspace()));
  protected readonly activeRoute = computed(() => {
    this.navigation();
    return (
      this.items().find(item => this.router.url.startsWith(item.route))?.route ??
      this.items()[0]?.route ??
      ''
    );
  });
  protected readonly activeItem = computed(() =>
    this.items().find(item => item.route === this.activeRoute())
  );

  protected navigateSection(event: Event): void {
    const route = (event.target as HTMLSelectElement).value;
    if (route) void this.router.navigateByUrl(route);
  }
}

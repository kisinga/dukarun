import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

/**
 * Floating action button component
 *
 * Fixed bottom-right FAB for primary page actions.
 */
@Component({
  selector: 'app-mobile-fab',
  imports: [NgIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (routerLink()) {
      <a
        [routerLink]="routerLink()"
        class="btn mobile-fab-action"
        [class.btn-primary]="variant() === 'primary'"
        [class.btn-ghost]="variant() === 'secondary'"
        [class.mobile-fab-action-secondary]="variant() === 'secondary'"
        [attr.aria-label]="ariaLabel()"
        [attr.title]="title()"
        [attr.aria-disabled]="disabled() || null"
      >
        <ng-icon [name]="icon()" size="1.55rem" />
        @if (label()) {
          <span>{{ label() }}</span>
        }
      </a>
    } @else {
      <button
        (click)="fabClick.emit()"
        class="btn mobile-fab-action"
        [class.btn-primary]="variant() === 'primary'"
        [class.btn-ghost]="variant() === 'secondary'"
        [class.mobile-fab-action-secondary]="variant() === 'secondary'"
        [attr.aria-label]="ariaLabel()"
        [attr.title]="title()"
        [disabled]="disabled()"
        type="button"
      >
        <ng-icon [name]="icon()" size="1.55rem" />
        @if (label()) {
          <span>{{ label() }}</span>
        }
      </button>
    }
  `,
  host: {
    class: 'dashboard-fab-host',
    '[class.stack-1]': 'stack() === 1',
  },
  styles: `
    :host {
      position: fixed;
      right: 1rem;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 6rem);
      z-index: 1000;
      pointer-events: none;
      display: block;
    }

    :host(.stack-1) {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 11rem);
    }

    .mobile-fab-action {
      pointer-events: auto;
      height: 4rem;
      min-width: 4rem;
      padding: 0 1.25rem;
      border-radius: 999px;
      gap: 0.7rem;
      font-size: 1rem;
      font-weight: 800;
      box-shadow:
        0 18px 42px color-mix(in oklch, var(--color-primary) 34%, transparent),
        0 0 0 8px color-mix(in oklch, var(--color-primary) 12%, transparent),
        inset 0 1px 0 rgb(255 255 255 / 0.28);
    }

    .mobile-fab-action:not(:has(span)) {
      width: 4rem;
      padding: 0;
    }

    .mobile-fab-action-secondary {
      border-color: color-mix(in oklch, var(--color-base-content) 18%, transparent);
      background: var(--color-base-100);
      color: var(--color-base-content);
      box-shadow:
        0 14px 32px rgb(0 0 0 / 0.16),
        0 0 0 8px color-mix(in oklch, var(--color-base-content) 8%, transparent),
        inset 0 1px 0 rgb(255 255 255 / 0.14);
    }

    .mobile-fab-action-secondary ng-icon {
      color: var(--color-primary);
    }

    @media (min-width: 1024px) {
      :host {
        right: 2rem;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 2rem);
      }

      :host(.stack-1) {
        bottom: calc(env(safe-area-inset-bottom, 0px) + 7rem);
      }
    }
  `,
})
export class MobileFabComponent {
  readonly routerLink = input<string | string[]>();
  readonly ariaLabel = input('Create new');
  readonly label = input('');
  readonly title = input<string | null>(null);
  readonly disabled = input(false);
  readonly icon = input('heroPlus');
  readonly stack = input(0);
  readonly variant = input<'primary' | 'secondary'>('primary');

  readonly fabClick = output<void>();
}

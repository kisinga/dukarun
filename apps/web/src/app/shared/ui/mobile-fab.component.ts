import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';

/**
 * Floating action button for the mobile primary action (ported from the
 * old app; self-positioned bottom-right, lifts above the bottom tab bar).
 */
@Component({
  selector: 'app-mobile-fab',
  imports: [IconComponent, RouterLink],
  template: `
    @if (routerLink()) {
      <a
        [routerLink]="routerLink()!"
        class="btn mobile-fab-action"
        [class.btn-primary]="variant() === 'primary'"
        [class.btn-ghost]="variant() === 'secondary'"
        [class.mobile-fab-action-secondary]="variant() === 'secondary'"
        [attr.aria-label]="ariaLabel()"
        [attr.title]="title()"
      >
        <app-icon [name]="icon()" size="lg" />
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
        <app-icon [name]="icon()" size="lg" />
        @if (label()) {
          <span>{{ label() }}</span>
        }
      </button>
    }
  `,
  styles: `
    :host {
      position: fixed;
      right: 1rem;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 6rem);
      z-index: 40;
      pointer-events: none;
      display: block;
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

    @media (min-width: 1024px) {
      :host {
        right: 2rem;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 2rem);
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
  readonly variant = input<'primary' | 'secondary'>('primary');

  readonly fabClick = output<void>();
}

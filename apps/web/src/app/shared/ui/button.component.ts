import { Component, input } from '@angular/core';

/**
 * Button (The Counter — one primary action per screen, 44px touch targets).
 * Attribute component on native <button>; owns button height, spacing, border,
 * interaction states, icon-only sizing, and the loading pattern.
 *
 * Usage: <button appButton variant="primary" [loading]="busy()" (click)="save()">Save</button>
 */
@Component({
  selector: 'button[appButton]',
  template: `
    @if (loading()) {
      <span class="loading loading-spinner loading-xs"></span>
    }
    <ng-content></ng-content>
  `,
  host: {
    class: 'counter-btn',
    '[class.counter-btn-primary]': 'variant() === "primary"',
    '[class.counter-btn-secondary]': 'variant() === "secondary"',
    '[class.counter-btn-soft]': 'variant() === "soft"',
    '[class.counter-btn-outline]': 'variant() === "outline"',
    '[class.counter-btn-ghost]': 'variant() === "ghost"',
    '[class.counter-btn-error]': 'variant() === "error"',
    '[class.counter-btn-sm]': 'size() === "sm"',
    '[class.counter-btn-md]': 'size() === "md"',
    '[class.counter-btn-icon]': 'iconOnly()',
    '[attr.disabled]': 'disabled() || loading() ? true : null',
    '[attr.aria-busy]': 'loading() ? true : null',
  },
})
export class ButtonComponent {
  readonly variant = input<'primary' | 'secondary' | 'soft' | 'outline' | 'ghost' | 'error'>(
    'primary'
  );
  readonly size = input<'sm' | 'md'>('sm');
  /** Makes a square button whose accessible name must come from aria-label/title. */
  readonly iconOnly = input(false);
  /** Swaps in a spinner and disables the button while work is in flight. */
  readonly loading = input(false);
  readonly disabled = input(false);
}

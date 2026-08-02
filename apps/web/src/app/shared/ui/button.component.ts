import { Component, input } from '@angular/core';

/**
 * Button (The Counter — one primary action per screen, 44px touch targets).
 * Attribute component on native <button>; consolidates the btn variant idiom
 * and the loading-spinner pattern pages used to hand-roll.
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
    class: 'btn gap-2',
    '[class.btn-primary]': 'variant() === "primary"',
    '[class.btn-outline]': 'variant() === "outline"',
    '[class.btn-ghost]': 'variant() === "ghost"',
    '[class.btn-error]': 'variant() === "error"',
    '[class.btn-sm]': 'size() === "sm"',
    '[class.min-h-11]': 'size() === "md"',
    '[attr.disabled]': 'disabled() || loading() ? true : null',
  },
})
export class ButtonComponent {
  readonly variant = input<'primary' | 'outline' | 'ghost' | 'error'>('primary');
  readonly size = input<'sm' | 'md'>('sm');
  /** Swaps in a spinner and disables the button while work is in flight. */
  readonly loading = input(false);
  readonly disabled = input(false);
}

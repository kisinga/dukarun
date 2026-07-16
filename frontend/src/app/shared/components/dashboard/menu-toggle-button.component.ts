import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Menu toggle button for drawer navigation.
 * Provides a properly-sized touch target (44x44px minimum) with a traditional hamburger icon.
 */
@Component({
  selector: 'app-menu-toggle-button',
  template: `
    <label [attr.for]="for()" class="btn btn-ghost btn-square btn-md" [attr.aria-label]="ariaLabel()">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuToggleButtonComponent {
  /** ID of the drawer checkbox this button toggles */
  for = input.required<string>();

  /** Accessibility label for the button */
  ariaLabel = input<string>('Open navigation menu');
}


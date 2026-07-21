import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Menu toggle button for drawer navigation.
 * Provides a properly-sized touch target (44x44px minimum) with a traditional hamburger icon.
 */
@Component({
  selector: 'app-menu-toggle-button',
  imports: [NgIcon],
  template: `
    <label
      [attr.for]="for()"
      class="btn btn-ghost btn-square btn-md"
      [attr.aria-label]="ariaLabel()"
    >
      <ng-icon name="heroBars3" size="1.25rem" />
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

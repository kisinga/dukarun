import { Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Canonical icon wrapper (The Counter — heroicons only, four sizes only).
 * sm 14 / md 16 (default) / lg 20 / xl 40 (decorative empty-state heroes).
 */
@Component({
  selector: 'app-icon',
  imports: [NgIcon],
  template: `<ng-icon [name]="name()" [size]="px()" />`,
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none' },
})
export class IconComponent {
  /** Registered heroicon name, e.g. 'heroPlus'. */
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');

  protected readonly px = computed(
    () =>
      ({
        sm: '0.875rem',
        md: '1rem',
        lg: '1.25rem',
        xl: '2.5rem',
      })[this.size()]
  );
}

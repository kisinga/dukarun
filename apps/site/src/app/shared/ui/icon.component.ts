import { Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-icon',
  imports: [NgIcon],
  template: `<ng-icon [name]="name()" [size]="px()" />`,
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none' },
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  protected readonly px = computed(
    () => ({ sm: '0.875rem', md: '1rem', lg: '1.25rem', xl: '2.5rem' })[this.size()]
  );
}

import { Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-icon',
  imports: [NgIcon],
  template: `
    @if (name() === 'whatsapp') {
      <span
        class="whatsapp-mark"
        [style.width]="px()"
        [style.height]="px()"
        aria-hidden="true"
      ></span>
    } @else {
      <ng-icon [name]="name()" [size]="px()" />
    }
  `,
  styles: `
    .whatsapp-mark {
      display: block;
      flex: none;
      background-color: currentColor;
      mask: url('/assets/icons/whatsapp.svg') center / contain no-repeat;
      -webkit-mask: url('/assets/icons/whatsapp.svg') center / contain no-repeat;
    }
  `,
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none' },
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  protected readonly px = computed(
    () => ({ sm: '0.875rem', md: '1rem', lg: '1.25rem', xl: '2.5rem' })[this.size()]
  );
}

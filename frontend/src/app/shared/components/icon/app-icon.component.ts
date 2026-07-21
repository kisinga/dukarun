import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Canonical icon wrapper — the single place icon sizes are decided.
 *
 * Wraps `<ng-icon>` (heroicons outline, registry: shared/icons/app-icons.ts)
 * and maps the allowed sizes from the design system:
 *   sm → 0.875rem (14px, next to text-xs)
 *   md → 1rem     (16px, next to text-sm — the default)
 *   lg → 1.25rem  (20px, standalone/emphasis)
 *   xl → 2.5rem   (40px, decorative only: empty states, large placeholders)
 *
 * Usage:
 *   <app-icon name="heroWallet" />
 *   <app-icon name="heroCheck" size="sm" />
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <ng-icon [name]="name()" [size]="px()" /> `,
})
export class AppIconComponent {
  /** Registered icon key, e.g. "heroWallet". */
  readonly name = input.required<string>();
  /** sm = 14px (text-xs), md = 16px (text-sm, default), lg = 20px (standalone), xl = 40px (decorative). */
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');

  readonly px = computed(() => {
    switch (this.size()) {
      case 'sm':
        return '0.875rem';
      case 'lg':
        return '1.25rem';
      case 'xl':
        return '2.5rem';
      default:
        return '1rem';
    }
  });
}

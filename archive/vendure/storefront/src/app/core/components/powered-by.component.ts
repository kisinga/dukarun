import { ChangeDetectionStrategy, Component } from '@angular/core';

import { DukarunMarkComponent } from './dukarun-mark.component';

/**
 * Subtle, intentional "Powered by Dukarun" attribution. Understated by default (muted, bordered
 * pill) and comes alive to the brand colour on hover. Links back to the platform for referral.
 */
@Component({
  selector: 'app-powered-by',
  standalone: true,
  imports: [DukarunMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      href="https://dukarun.com/?utm_source=storefront&utm_medium=powered_by"
      target="_blank"
      rel="noopener"
      aria-label="Powered by Dukarun — open dukarun.com"
      class="group inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3.5 py-1.5 transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
    >
      <app-dukarun-mark cls="h-[1.15rem] w-auto transition-transform duration-200 group-hover:scale-110" />
      <span class="flex items-baseline gap-1 text-xs leading-none">
        <span class="text-base-content/50">Powered by</span>
        <span class="font-bold tracking-tight text-base-content transition-colors duration-200 group-hover:text-primary">
          Dukarun
        </span>
      </span>
    </a>
  `,
})
export class PoweredByComponent {}

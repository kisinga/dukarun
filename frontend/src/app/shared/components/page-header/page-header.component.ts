import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/**
 * Page Header Component
 *
 * A reusable, mobile-first header that matches the dashboard overview design.
 * Uses the exact same design patterns as the dashboard for consistency.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1.5">
          <h1 class="text-2xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
            {{ title }}
          </h1>
          <ng-content select="[badge]"></ng-content>
        </div>
        @if (subtitle) {
          <p class="text-xs sm:text-sm text-base-content/60 font-medium">{{ subtitle }}</p>
        }
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <ng-content select="[actions]"></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class PageHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle = '';
}

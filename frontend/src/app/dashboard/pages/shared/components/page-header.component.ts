import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Reusable Page Header Component
 *
 * Standardized header for creation/edit pages with back button and title.
 */
@Component({
  selector: 'app-page-header',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sticky top-0 z-10 bg-base-100 border-b border-base-200 px-4 py-3">
      <div class="flex items-center justify-between">
        <button (click)="onBack()" class="btn btn-ghost btn-sm btn-circle" aria-label="Go back">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            ></path>
          </svg>
        </button>
        <h1 class="text-lg font-semibold">{{ title() }}</h1>
        <div class="w-10"></div>
        <!-- Spacer for centering -->
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly backClick = output<void>();

  onBack(): void {
    this.backClick.emit();
  }
}

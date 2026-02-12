import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Rejection Banner - Pinned alert shown when a form is restored from a rejected approval.
 * Displays the reviewer's message and allows dismissal.
 */
@Component({
  selector: 'app-rejection-banner',
  standalone: true,
  template: `
    @if (message()) {
      <div class="alert alert-warning mb-4 sticky top-12 z-20 shadow-md">
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div class="flex-1">
          <p class="text-sm font-semibold">Request Rejected</p>
          <p class="text-sm">{{ message() }}</p>
        </div>
        <button (click)="dismiss.emit()" class="btn btn-ghost btn-xs">Dismiss</button>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RejectionBannerComponent {
  readonly message = input<string | null>(null);
  readonly dismiss = output<void>();
}

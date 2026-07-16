import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Reusable Error Alert Component
 *
 * Displays error messages with dismiss functionality.
 */
@Component({
  selector: 'app-error-alert',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message()) {
      <div class="alert alert-error mb-4">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <span>{{ message() }}</span>
        <button (click)="onDismiss()" class="btn btn-ghost btn-sm">×</button>
      </div>
    }
  `,
})
export class ErrorAlertComponent {
  readonly message = input<string | null>(null);
  readonly dismiss = output<void>();

  onDismiss(): void {
    this.dismiss.emit();
  }
}

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/**
 * Reusable Error Alert Component
 *
 * Displays error messages with dismiss functionality.
 */
@Component({
  selector: 'app-error-alert',
  imports: [CommonModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message()) {
      <div class="alert alert-error mb-4">
        <ng-icon name="heroExclamationCircle" size="1.25rem" />
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

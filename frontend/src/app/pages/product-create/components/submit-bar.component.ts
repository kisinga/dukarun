import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ItemType } from '../types/product-creation.types';

/**
 * Submit Bar Component
 *
 * Sticky submit button with loading state and status messages.
 * Handles all submission-related UI feedback.
 */
@Component({
  selector: 'app-submit-bar',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sticky bottom-4 bg-base-100 p-4 rounded-lg shadow-lg border">
      <div class="flex flex-row gap-2">
        <button type="button" class="btn btn-soft w-1/2" (click)="onPrevious()">
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Back</span>
        </button>
        <button
          type="button"
          class="btn btn-primary w-1/2"
          [class.btn-disabled]="!canSubmit()"
          [class.loading]="isLoading()"
          (click)="onSubmit()"
        >
          @if (isLoading()) {
            <span class="loading loading-spinner loading-sm"></span>
            <span>Saving...</span>
          } @else {
            @if (isEditMode()) {
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>Update</span>
            } @else {
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Create</span>
            }
          }
        </button>
      </div>

      @if (submitError()) {
        <div class="alert alert-error mt-2 text-xs flex items-center gap-2">
          <span class="material-symbols-outlined text-sm">error</span>
          <span>{{ submitError() }}</span>
        </div>
      }

      @if (submitSuccess()) {
        <div class="alert alert-success mt-2 text-xs flex items-center gap-2">
          <span class="material-symbols-outlined text-sm">check_circle</span>
          <span>Product created successfully.</span>
        </div>
      }
    </div>
  `,
})
export class SubmitBarComponent {
  // Inputs
  readonly canSubmit = input.required<boolean>();
  readonly isLoading = input.required<boolean>();
  readonly isEditMode = input.required<boolean>();
  readonly itemType = input.required<ItemType>();
  readonly submitError = input<string | null>(null);
  readonly submitSuccess = input<boolean>(false);

  // Outputs
  readonly submit = output<void>();
  readonly previous = output<void>();

  /**
   * Handle submit button click
   */
  onSubmit(): void {
    this.submit.emit();
  }

  /**
   * Handle previous button click
   */
  onPrevious(): void {
    this.previous.emit();
  }
}

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ItemType } from '../types/product-creation.types';

/**
 * Submit Bar Component
 *
 * Sticky submit button with loading state and status messages.
 * Handles all submission-related UI feedback.
 */
@Component({
  selector: 'app-submit-bar',
  imports: [CommonModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sticky bottom-4 bg-base-100 p-4 rounded-lg shadow-lg border">
      <div class="flex flex-row gap-2">
        <button type="button" class="btn btn-soft w-1/2" (click)="onPrevious()">
          <ng-icon name="heroChevronLeft" size="1.25rem" />
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
              <ng-icon name="heroCheck" size="1.25rem" />
              <span>Update</span>
            } @else {
              <ng-icon name="heroPlus" size="1.25rem" />
              <span>Create</span>
            }
          }
        </button>
      </div>

      @if (submitError()) {
        <div class="alert alert-error mt-2 text-xs flex items-center gap-2">
          <ng-icon name="heroExclamationCircle" size="1rem" />
          <span>{{ submitError() }}</span>
        </div>
      }

      @if (submitSuccess()) {
        <div class="alert alert-success mt-2 text-xs flex items-center gap-2">
          <ng-icon name="heroCheckCircle" size="1rem" />
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

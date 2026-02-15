import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

export interface DeleteConfirmationData {
  /** Name of the entity being deleted (e.g., "John Doe", "Product Name") */
  entityName: string;
  /** Optional: Count of related items (e.g., addresses, variants) */
  relatedCount?: number;
  /** Optional: Label for related items (e.g., "address", "variant") */
  relatedLabel?: string;
  /** Optional: Additional warning details */
  warningDetails?: string[];
}

/**
 * Reusable delete confirmation modal
 * Uses daisyUI modal with HTML dialog element
 */
@Component({
  selector: 'app-delete-confirmation-modal',
  imports: [CommonModule],
  template: `
    <dialog #modal class="modal modal-backdrop-anim">
      <div class="modal-box modal-box-anim">
        <!-- Icon -->
        <div class="flex justify-center mb-4">
          <div class="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-8 w-8 text-error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        <!-- Title -->
        <h3 class="font-bold text-xl text-center mb-2">{{ title() }}</h3>

        <!-- Message -->
        <p class="text-center text-base-content/70 mb-4">
          Are you sure you want to delete
          <span class="font-semibold">"{{ data().entityName }}"</span>?
        </p>

        <!-- Warning Details -->
        @if (hasRelatedItems()) {
          <div role="alert" class="alert alert-warning mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div class="text-sm">
              <p class="font-semibold mb-1">
                This {{ entityType() }} has {{ relatedCount() }} {{ relatedLabel()
                }}{{ relatedCount() === 1 ? '' : 's' }}
                that will also be deleted.
              </p>
              @if (hasWarningDetails()) {
                <ul class="list-disc list-inside space-y-0.5 text-xs mt-2">
                  @for (detail of warningDetails(); track detail) {
                    <li>{{ detail }}</li>
                  }
                </ul>
              }
              <p class="mt-2 font-semibold text-error">This action cannot be undone.</p>
            </div>
          </div>
        } @else if (hasWarningDetails()) {
          <div role="alert" class="alert alert-warning mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div class="text-sm">
              <p class="font-semibold mb-1">This will permanently remove:</p>
              <ul class="list-disc list-inside space-y-0.5 text-xs">
                @for (detail of warningDetails(); track detail) {
                  <li>{{ detail }}</li>
                }
              </ul>
              <p class="mt-2 font-semibold text-error">This action cannot be undone.</p>
            </div>
          </div>
        } @else {
          <p class="text-sm text-base-content/60 text-center mb-6">This action cannot be undone.</p>
        }

        <!-- Actions -->
        <div class="flex gap-3">
          <button type="button" (click)="onCancel()" class="btn btn-ghost flex-1">Cancel</button>
          <button type="button" (click)="onConfirm()" class="btn btn-error flex-1">
            {{ confirmButtonText() }}
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" (click)="onCancel()">close</button>
      </form>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteConfirmationModalComponent {
  readonly data = input.required<DeleteConfirmationData>();
  readonly title = input<string>('Delete Item?');
  readonly entityType = input<string>('item');
  readonly confirmButtonText = input<string>('Delete');
  readonly confirm = output<void>();
  readonly cancel = output<void>();

  readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  // Computed properties for cleaner template logic
  readonly hasRelatedItems = computed(() => {
    const count = this.data().relatedCount;
    return count !== undefined && count > 0;
  });

  readonly relatedCount = computed(() => this.data().relatedCount ?? 0);
  readonly relatedLabel = computed(() => this.data().relatedLabel || 'related item');
  readonly warningDetails = computed(() => this.data().warningDetails ?? []);
  readonly hasWarningDetails = computed(() => this.warningDetails().length > 0);

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }

  /**
   * Show the modal
   */
  show(): void {
    const modal = this.modalRef()?.nativeElement;
    modal?.showModal();
  }

  /**
   * Hide the modal
   */
  hide(): void {
    const modal = this.modalRef()?.nativeElement;
    modal?.close();
  }
}

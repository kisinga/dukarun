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
import { NgIcon } from '@ng-icons/core';

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
  imports: [CommonModule, NgIcon],
  template: `
    <dialog #modal class="modal modal-backdrop-anim">
      <div class="modal-box modal-box-anim">
        <!-- Icon -->
        <div class="flex justify-center mb-4">
          <div class="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center">
            <ng-icon name="heroExclamationTriangle" size="2.5rem" class="text-error" />
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
            <ng-icon name="heroExclamationTriangle" size="1.25rem" class="shrink-0" />
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
            <ng-icon name="heroExclamationTriangle" size="1.25rem" class="shrink-0" />
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

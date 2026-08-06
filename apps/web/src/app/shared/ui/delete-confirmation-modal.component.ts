import { Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

export interface DeleteConfirmationData {
  /** Name of the entity being removed (e.g. "Jiko Kiosk", "Mama Fua Shop"). */
  entityName: string;
  /** Optional: count of related items affected (e.g. variants). */
  relatedCount?: number;
  /** Optional: label for related items (e.g. "variant"). */
  relatedLabel?: string;
  /** Optional: extra warning detail lines. */
  warningDetails?: string[];
}

/**
 * Reusable destructive-action confirmation modal (ported from the old app).
 * Shows via show()/hide() on the component's viewChild dialog.
 */
@Component({
  selector: 'app-delete-confirmation-modal',
  imports: [NgIcon],
  template: `
    <dialog #modal class="modal">
      <div class="modal-box">
        <div class="mb-4 flex justify-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
            <ng-icon name="heroExclamationTriangle" size="2.5rem" class="text-error" />
          </div>
        </div>

        <h3 class="type-title mb-2 text-center">{{ title() }}</h3>

        <p class="mb-4 text-center text-base-content/70">
          Are you sure you want to {{ verb() }}
          <span class="font-semibold">"{{ data().entityName }}"</span>?
        </p>

        @if (hasRelatedItems()) {
          <div role="alert" class="alert alert-warning mb-6">
            <ng-icon name="heroExclamationTriangle" size="1.25rem" class="shrink-0" />
            <div class="text-sm">
              <p class="mb-1 font-semibold">
                This {{ entityType() }} has {{ relatedCount() }} {{ relatedLabel()
                }}{{ relatedCount() === 1 ? '' : 's' }} that will also be affected.
              </p>
              @if (hasWarningDetails()) {
                <ul class="mt-2 list-inside list-disc space-y-0.5 text-xs">
                  @for (detail of warningDetails(); track detail) {
                    <li>{{ detail }}</li>
                  }
                </ul>
              }
              @if (irreversible()) {
                <p class="mt-2 font-semibold text-error">This action cannot be undone.</p>
              }
            </div>
          </div>
        } @else if (hasWarningDetails()) {
          <div role="alert" class="alert alert-warning mb-6">
            <ng-icon name="heroExclamationTriangle" size="1.25rem" class="shrink-0" />
            <div class="text-sm">
              <ul class="list-inside list-disc space-y-0.5 text-xs">
                @for (detail of warningDetails(); track detail) {
                  <li>{{ detail }}</li>
                }
              </ul>
              @if (irreversible()) {
                <p class="mt-2 font-semibold text-error">This action cannot be undone.</p>
              }
            </div>
          </div>
        } @else {
          @if (irreversible()) {
            <p class="mb-6 text-center text-sm text-base-content/60">
              This action cannot be undone.
            </p>
          }
        }

        <div class="flex gap-3">
          <button type="button" (click)="onCancel()" class="btn flex-1 btn-ghost min-h-11">
            Cancel
          </button>
          <button type="button" (click)="onConfirm()" class="btn flex-1 btn-error min-h-11">
            {{ confirmButtonText() }}
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" (click)="onCancel()">close</button>
      </form>
    </dialog>
  `,
})
export class DeleteConfirmationModalComponent {
  readonly data = input.required<DeleteConfirmationData>();
  readonly title = input('Delete item?');
  readonly entityType = input('item');
  readonly verb = input('delete');
  readonly confirmButtonText = input('Delete');
  readonly irreversible = input(true);
  readonly confirm = output<void>();
  readonly cancel = output<void>();

  private readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');

  protected readonly hasRelatedItems = computed(() => {
    const count = this.data().relatedCount;
    return count !== undefined && count > 0;
  });
  protected readonly relatedCount = computed(() => this.data().relatedCount ?? 0);
  protected readonly relatedLabel = computed(() => this.data().relatedLabel || 'related item');
  protected readonly warningDetails = computed(() => this.data().warningDetails ?? []);
  protected readonly hasWarningDetails = computed(() => this.warningDetails().length > 0);

  protected onConfirm(): void {
    this.confirm.emit();
  }

  protected onCancel(): void {
    this.cancel.emit();
    this.hide();
  }

  show(): void {
    this.modalRef()?.nativeElement.showModal();
  }

  hide(): void {
    this.modalRef()?.nativeElement.close();
  }
}

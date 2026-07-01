import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, input, Output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { SupplierCreateComponent } from '../../supplier-create/supplier-create.component';

/**
 * Supplier Create Modal Component
 *
 * Modal wrapper for supplier creation form.
 * Reuses SupplierCreateComponent for consistent UX.
 */
@Component({
  selector: 'app-supplier-create-modal',
  imports: [CommonModule, NgIcon, SupplierCreateComponent],
  template: `
    <dialog class="modal" [class.modal-open]="isOpen()" id="supplier-create-modal">
      <div class="modal-box max-w-2xl max-h-[90vh] overflow-y-auto">
        <!-- Modal Header -->
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">Create New Supplier</h3>
          <button
            class="btn btn-sm btn-circle btn-ghost"
            (click)="close()"
            aria-label="Close modal"
          >
            <ng-icon name="heroXMark" size="1.25rem" />
          </button>
        </div>

        <!-- Supplier Create Form -->
        <app-supplier-create [mode]="'modal'" (supplierCreated)="handleSupplierCreated($event)" />
      </div>
      <form method="dialog" class="modal-backdrop" (click)="close()">
        <button>close</button>
      </form>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierCreateModalComponent {
  readonly isOpen = input.required<boolean>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() supplierCreated = new EventEmitter<string>();

  handleSupplierCreated(supplierId: string): void {
    this.supplierCreated.emit(supplierId);
    this.close();
  }

  close(): void {
    this.closeModal.emit();
  }
}

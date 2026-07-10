import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reconcile-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <dialog class="modal modal-open" (click)="$event.target === $event.currentTarget && cancel.emit()">
      <div class="modal-box max-w-lg max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <h3 class="font-bold text-lg mb-2">{{ title() }}</h3>
        <p class="text-sm text-base-content/70 mb-4">{{ detail() }}</p>

        @if (success()) {
          <div class="alert alert-success mb-4">
            <span>{{ success() }}</span>
          </div>
        }
        @if (error()) {
          <div class="alert alert-error mb-4">
            <span>{{ error() }}</span>
          </div>
        }

        <div class="space-y-4">
          <ng-content select="[extraFields]"></ng-content>

          <label class="form-control w-full">
            <span class="label"><span class="label-text">{{ reasonLabel() }}</span></span>
            <textarea
              class="textarea textarea-bordered textarea-sm w-full"
              rows="3"
              [ngModel]="reason()"
              (ngModelChange)="reasonChange.emit($event)"
              [placeholder]="reasonPlaceholder()"
            ></textarea>
          </label>
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" (click)="cancel.emit()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="confirm.emit()" [disabled]="confirming()">
            @if (confirming()) {
              <span class="loading loading-spinner loading-sm"></span>
            }
            Confirm
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" (click)="cancel.emit()">close</button>
      </form>
    </dialog>
  `,
})
export class ReconcileModalComponent {
  title = input.required<string>();
  detail = input.required<string>();
  reason = input.required<string>();
  reasonLabel = input<string>('Reason');
  reasonPlaceholder = input<string>('Reason for reconciliation…');
  confirming = input<boolean>(false);
  error = input<string | null>(null);
  success = input<string | null>(null);

  reasonChange = output<string>();
  confirm = output<void>();
  cancel = output<void>();
}

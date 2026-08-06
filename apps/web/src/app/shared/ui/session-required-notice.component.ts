import { Component, inject, input } from '@angular/core';
import { CashierSessionDialogService } from '../../core/cashier-session-dialog.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-session-required-notice',
  imports: [IconComponent],
  template: `
    <div
      role="alert"
      class="alert alert-warning items-start text-sm sm:items-center"
      [class.mb-3]="!compact()"
      [class.py-2]="compact()"
    >
      <app-icon name="heroExclamationTriangle" class="mt-0.5 sm:mt-0" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold">Cashier session required</p>
        <p class="text-base-content/70">Open a session before {{ action() }}.</p>
      </div>
      <button
        type="button"
        class="link min-h-11 shrink-0 font-semibold"
        (click)="cashierDialog.show()"
      >
        Open session
      </button>
    </div>
  `,
})
export class SessionRequiredNoticeComponent {
  protected readonly cashierDialog = inject(CashierSessionDialogService);
  readonly action = input('recording this transaction');
  readonly compact = input(false);
}

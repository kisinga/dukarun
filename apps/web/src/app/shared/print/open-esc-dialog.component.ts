import { Component, inject } from '@angular/core';
import { TaskDialogComponent } from '../ui/task-dialog.component';
import { ButtonComponent } from '../ui/button.component';
import { OpenEscPrintService } from './open-esc-print.service';
import { OPEN_ESC_STORE_URL } from './open-esc';

@Component({
  selector: 'app-open-esc-dialog',
  imports: [TaskDialogComponent, ButtonComponent],
  template: `
    @if (printer.pending(); as job) {
      <app-task-dialog
        [open]="true"
        title="Print could not start"
        [error]="job.error"
        (closed)="printer.close()"
      >
        <div class="space-y-3">
          <p class="break-words font-medium">{{ job.title }}</p>
          <p role="status">
            {{ job.preparing ? 'Preparing…' : 'Check the printer before requesting another copy.' }}
          </p>
          <p class="type-caption">
            If Open ESC does not open, install it and select your paired printer as the default.
          </p>
          <a appButton variant="ghost" [href]="storeUrl" target="_blank" rel="noopener noreferrer"
            >Install Open ESC</a
          >
        </div>
        <div taskFooter class="flex flex-wrap justify-end gap-2">
          <button appButton variant="ghost" type="button" (click)="printer.close()">Close</button>
          @if (job.systemPrint) {
            <button
              appButton
              variant="outline"
              type="button"
              [disabled]="job.preparing"
              (click)="printer.useSystemPrinter()"
            >
              Use system printer
            </button>
          }
          @if (job.retry) {
            <button appButton type="button" [disabled]="job.preparing" (click)="printer.retry()">
              Prepare again
            </button>
          }
        </div>
      </app-task-dialog>
    }
  `,
})
export class OpenEscDialogComponent {
  protected readonly printer = inject(OpenEscPrintService);
  protected readonly storeUrl = OPEN_ESC_STORE_URL;
}

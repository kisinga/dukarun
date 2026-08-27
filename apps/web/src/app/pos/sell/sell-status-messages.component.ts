import { Component, input, output } from '@angular/core';
import type { PrintFormat } from '../../shared/print/print.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import type { DraftFlag, SaleSuccessMessage } from './sell.types';

type PrintTemplateOption = { id: PrintFormat; name: string; width: string };

@Component({
  selector: 'app-sell-status-messages',
  imports: [ButtonComponent, IconComponent, MoneyComponent],
  template: `
    @if (success(); as message) {
      <section class="card mb-4 bg-base-100" aria-live="polite">
        <div class="card-body flex-row flex-wrap items-center gap-4 p-4">
          <app-icon
            name="heroCheckCircle"
            size="xl"
            [class.text-success]="message.tone === 'success'"
            [class.text-warning]="message.tone === 'warning'"
          />
          <div class="min-w-48 flex-1">
            <p class="type-heading">{{ message.text }}</p>
            @if (message.tone === 'warning') {
              <p class="text-sm text-base-content/60">
                It is safely queued and will appear in Today's Sales after syncing.
              </p>
            }
          </div>
          @if (message.tone === 'success' && message.orderId && printerEnabled()) {
            <select
              class="select select-bordered select-sm min-h-11"
              [value]="printFormat()"
              (change)="printFormatChange.emit(selectPrintFormat($event))"
              title="Receipt format"
            >
              @for (template of printTemplates(); track template.id) {
                <option [value]="template.id" [selected]="template.id === printFormat()">
                  {{ template.name }}
                </option>
              }
            </select>
            <button
              appButton
              variant="outline"
              size="md"
              [disabled]="busy()"
              (click)="printReceipt.emit(message.orderId)"
            >
              <app-icon name="heroPrinter" />
              Print receipt
            </button>
          }
          <button appButton size="md" (click)="newSale.emit()">
            <app-icon name="heroPlus" />
            New sale
          </button>
        </div>
      </section>
    }

    @if (error(); as message) {
      <div class="alert alert-error mb-4 py-3" role="alert">
        <app-icon name="heroExclamationTriangle" />
        <span>{{ message }}</span>
        <button
          appButton
          variant="ghost"
          size="sm"
          [iconOnly]="true"
          aria-label="Dismiss error"
          (click)="dismissError.emit()"
        >
          <app-icon name="heroXMark" />
        </button>
      </div>
    }

    @if (notice(); as message) {
      <div class="alert alert-success mb-4 py-3" aria-live="polite">
        <app-icon name="heroCheckCircle" />
        <span>{{ message }}</span>
        <button
          appButton
          variant="ghost"
          size="sm"
          [iconOnly]="true"
          aria-label="Dismiss notice"
          (click)="dismissNotice.emit()"
        >
          <app-icon name="heroXMark" />
        </button>
      </div>
    }

    @if (draftId() && draftFlags().length > 0 && !draftFlagsDismissed()) {
      <div class="alert alert-warning mb-4 items-start py-3" role="status">
        <app-icon name="heroExclamationTriangle" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold">This proforma changed since it was saved</p>
          <ul class="mt-1 list-disc space-y-1 pl-4 text-sm">
            @for (flag of draftFlags(); track $index) {
              <li>
                @switch (flag.kind) {
                  @case ('price') {
                    {{ flag.label }}: quoted <app-money [amount]="flag.was" />, now
                    <app-money [amount]="flag.now" />.
                  }
                  @case ('override') {
                    {{ flag.label }}: list was <app-money [amount]="flag.was" />, now
                    <app-money [amount]="flag.now" />. Override
                    <app-money [amount]="flag.overridePrice" /> kept.
                  }
                  @case ('override-blocked') {
                    {{ flag.label }}: override <app-money [amount]="flag.overridePrice" /> needs a
                    manager. Checkout will be rejected.
                  }
                  @case ('stock') {
                    {{ flag.label }}: only {{ flag.available }} in stock, proforma needs
                    {{ flag.needed }}.
                  }
                  @case ('unavailable') {
                    {{ flag.count }} {{ flag.count === 1 ? 'line is' : 'lines are' }} no longer
                    available and were skipped.
                  }
                }
              </li>
            }
          </ul>
        </div>
        <button
          appButton
          variant="ghost"
          size="sm"
          [iconOnly]="true"
          aria-label="Dismiss proforma warnings"
          (click)="dismissDraftWarnings.emit()"
        >
          <app-icon name="heroXMark" />
        </button>
      </div>
    }
  `,
})
export class SellStatusMessagesComponent {
  readonly success = input.required<SaleSuccessMessage | null>();
  readonly error = input.required<string | null>();
  readonly notice = input.required<string | null>();
  readonly draftId = input.required<string | null>();
  readonly draftFlags = input.required<DraftFlag[]>();
  readonly draftFlagsDismissed = input.required<boolean>();
  readonly printerEnabled = input.required<boolean>();
  readonly busy = input.required<boolean>();
  readonly printFormat = input.required<PrintFormat>();
  readonly printTemplates = input.required<PrintTemplateOption[]>();

  readonly printFormatChange = output<PrintFormat>();
  readonly printReceipt = output<string>();
  readonly newSale = output<void>();
  readonly dismissError = output<void>();
  readonly dismissNotice = output<void>();
  readonly dismissDraftWarnings = output<void>();

  protected selectPrintFormat(event: Event): PrintFormat {
    return (event.target as HTMLSelectElement).value as PrintFormat;
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { PrintService } from '../../../../shared/services/print.service';
import { PrintPreferencesService } from '../../../../shared/services/print-preferences.service';
import { PaymentMethodService } from '@dukarun/payments';
import { NgIcon } from '@ng-icons/core';
import type {
  OrderData,
  PrintMeta,
  DocumentType,
} from '../../../../shared/services/print-templates';

@Component({
  selector: 'app-print-controls',
  standalone: true,
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-row items-center justify-end gap-2">
      <select
        class="select select-bordered select-sm flex-[2] sm:flex-none sm:w-auto"
        [value]="selectedTemplateId()"
        (change)="onTemplateChange($event)"
      >
        @for (template of templates; track template.id) {
          <option [value]="template.id">{{ template.name }}</option>
        }
      </select>
      <button
        class="btn btn-primary btn-sm flex-1 sm:flex-none sm:min-w-0 touch-manipulation"
        (click)="onPrint()"
        [disabled]="!order() || disabled()"
      >
        <ng-icon name="heroPrinter" size="1rem" />
        Print
      </button>
    </div>
  `,
})
export class PrintControlsComponent implements OnInit {
  readonly order = input.required<OrderData | null>();
  readonly disabled = input<boolean>(false);
  readonly printed = output<void>();

  readonly selectedTemplateId = signal<string>('receipt-52mm');

  private readonly printService = inject(PrintService);
  private readonly printPreferences = inject(PrintPreferencesService);
  private readonly paymentMethodService = inject(PaymentMethodService);

  readonly templates = this.printService.getAvailableTemplates();

  ngOnInit(): void {
    void this.printPreferences.getDefaultTemplateId().then((id) => {
      this.selectedTemplateId.set(id);
    });
  }

  onTemplateChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const id = select.value;
    this.selectedTemplateId.set(id);
    void this.printPreferences.setDefaultTemplateId(id);
  }

  async onPrint(): Promise<void> {
    const order = this.order();
    if (!order) return;

    const docType = this.resolveDocumentType(order);
    const paymentMethodName = await this.resolvePaymentMethodName(order);
    const printMeta: PrintMeta = {
      documentType: docType,
      paymentMethodName: paymentMethodName ?? undefined,
    };

    await this.printService.printOrder(order, this.selectedTemplateId(), printMeta);
    this.printed.emit();
  }

  private resolveDocumentType(order: OrderData): DocumentType {
    if (order.state === 'Draft') return 'proforma';
    const templateId = this.selectedTemplateId();
    if (templateId === 'a4') return 'invoice';
    return 'receipt';
  }

  private async resolvePaymentMethodName(order: OrderData): Promise<string | null> {
    const code = order.payments?.[0]?.method;
    if (!code) return null;
    try {
      const methods = await this.paymentMethodService.getPaymentMethods();
      const found = methods.find((m) => m.code === code);
      return found?.name ?? null;
    } catch {
      return null;
    }
  }
}

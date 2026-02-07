import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { PrintService } from '../../services/print.service';
import { PrintPreferencesService } from '../../services/print-preferences.service';
import type { OrderData } from '../../services/print-templates';

@Component({
  selector: 'app-print-controls',
  standalone: true,
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
          />
        </svg>
        Print
      </button>
    </div>
  `,
})
export class PrintControlsComponent {
  readonly order = input.required<OrderData | null>();
  readonly disabled = input<boolean>(false);
  readonly printed = output<void>();

  readonly selectedTemplateId = signal<string>('receipt-52mm');

  private readonly printService = inject(PrintService);
  private readonly printPreferences = inject(PrintPreferencesService);

  readonly templates = this.printService.getAvailableTemplates();

  constructor() {
    this.selectedTemplateId.set(this.printPreferences.getDefaultTemplateId());
  }

  onTemplateChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const id = select.value;
    this.selectedTemplateId.set(id);
    this.printPreferences.setDefaultTemplateId(id);
  }

  async onPrint(): Promise<void> {
    const order = this.order();
    if (!order) return;

    await this.printService.printOrder(order, this.selectedTemplateId());
    this.printed.emit();
  }
}

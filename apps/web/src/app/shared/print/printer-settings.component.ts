import { Component, inject, input, Injector } from '@angular/core';
import { ButtonComponent } from '../ui/button.component';
import { OpenEscPrintService } from './open-esc-print.service';
import { OPEN_ESC_STORE_URL, openEscCalibration } from './open-esc';
import { PrintService } from './print.service';
import { PreparedPrintDirective } from './prepared-print.directive';

@Component({
  selector: 'app-printer-settings',
  imports: [ButtonComponent, PreparedPrintDirective],
  template: `
    <details class="rounded-field border border-base-300 p-3 text-sm">
      <summary class="cursor-pointer font-medium">
        Print settings{{
          showPaper()
            ? ' · ' +
              (print.format() === 'a4'
                ? 'A4'
                : print.format() === 'receipt-80mm'
                  ? '80 mm'
                  : '52 mm')
            : ''
        }}
      </summary>
      <div class="mt-3 space-y-3">
        @if (showPaper()) {
          <label class="block"
            ><span class="type-caption">Document size</span>
            <select
              class="select mt-1 w-full"
              [value]="print.format()"
              (change)="setFormat($any($event.target).value)"
            >
              @for (format of print.getAvailableTemplates(); track format.id) {
                <option [value]="format.id">{{ format.width }}</option>
              }
            </select>
          </label>
        }
        @if (printer.supported) {
          <label class="block">
            <span class="type-caption">Thermal printing</span>
            <select
              class="select mt-1 w-full"
              [value]="printer.supported ? printer.method() : 'system'"
              (change)="printer.setMethod($any($event.target).value)"
            >
              <option value="system">System printer / PDF</option>
              <option value="open-esc">Open ESC</option>
            </select>
          </label>
        }
        <p class="type-caption">Saved on this device. A4 documents use system printing.</p>
        @if (printer.supported && printer.method() === 'open-esc') {
          <p class="type-caption">
            For a 57/58 mm roll, choose the 52 mm receipt paper size. For an 80 mm roll, choose 80
            mm.
          </p>
          <p>
            In Open ESC, pair your printer and choose it as the default. Match its DPI and printable
            width. Use zero side margins.
          </p>
          <p class="type-caption">
            For calibration, set the bottom margin to zero. Confirm both edges and the final END
            line print.
          </p>
          <details class="rounded-field border border-base-300 p-3">
            <summary class="cursor-pointer">Thermal print quality</summary>
            <p class="type-caption mt-2">
              Match these values to Open ESC so barcodes and QR codes render sharply.
            </p>
            <label class="mt-2 block"
              ><span class="type-caption">Paper width in Open ESC (cm)</span>
              <input
                class="input w-full"
                type="number"
                min="2"
                max="12"
                step="0.01"
                [value]="printer.profile().widthCm"
                (change)="printer.setProfile(+$any($event.target).value, printer.profile().dpi)"
              />
            </label>
            <label class="mt-2 block"
              ><span class="type-caption">Printer DPI</span>
              <input
                class="input w-full"
                type="number"
                min="100"
                max="600"
                step="1"
                [value]="printer.profile().dpi"
                (change)="printer.setProfile(printer.profile().widthCm, +$any($event.target).value)"
              />
            </label>
          </details>
          <div class="flex flex-wrap gap-2">
            <button
              appButton
              variant="outline"
              type="button"
              [appPrintDocument]="calibration"
              (click)="print.systemPrint(calibration)"
            >
              Test receipt
            </button>
            <a appButton variant="ghost" [href]="storeUrl" target="_blank" rel="noopener noreferrer"
              >Install Open ESC</a
            >
          </div>
        }
        @if (!printer.supported) {
          <p class="type-caption">
            Open ESC requires Android Chrome. This device uses system printing.
          </p>
        }
      </div>
    </details>
  `,
})
export class PrinterSettingsComponent {
  readonly showPaper = input(true);
  protected readonly calibration = openEscCalibration();
  private readonly injector = inject(Injector);
  protected get print(): PrintService {
    return this.injector.get(PrintService);
  }
  protected setFormat(value: string): void {
    if (value === 'a4' || value === 'receipt-52mm' || value === 'receipt-80mm')
      this.print.setFormat(value);
  }
  protected readonly printer = inject(OpenEscPrintService);
  protected readonly storeUrl = OPEN_ESC_STORE_URL;
}

import { Injectable, inject } from '@angular/core';
import type { Variant } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';

export type BarcodeLabelLayout = 'a4-grid' | 'compact-roll';

export interface BarcodeLabelRenderFailure {
  variant: Variant;
  message: string;
}

export class BarcodeLabelRenderError extends Error {
  constructor(readonly failures: BarcodeLabelRenderFailure[]) {
    super('One or more barcode labels could not be rendered.');
    this.name = 'BarcodeLabelRenderError';
  }
}

@Injectable({ providedIn: 'root' })
export class BarcodeLabelPrintService {
  private readonly print = inject(PrintService);

  async printLabels(
    variants: readonly Variant[],
    layout: BarcodeLabelLayout,
    batchNumber: number,
    batchCount: number
  ): Promise<void> {
    const bwip = await import('bwip-js/browser');
    const failures: BarcodeLabelRenderFailure[] = [];
    const labels = variants.flatMap(variant => {
      const barcode = variant.barcode?.trim();
      if (!barcode) {
        failures.push({ variant, message: 'Barcode is missing.' });
        return [];
      }
      try {
        const svg = bwip.toSVG({
          bcid: 'code128',
          text: barcode,
          scale: 2,
          height: 10,
          includetext: false,
          paddingwidth: 8,
          paddingheight: 1,
          backgroundcolor: 'FFFFFF',
        });
        return [this.labelHtml(variant, barcode, svg)];
      } catch (error) {
        failures.push({
          variant,
          message: error instanceof Error ? error.message : 'Code 128 cannot encode this value.',
        });
        return [];
      }
    });
    if (failures.length > 0) throw new BarcodeLabelRenderError(failures);

    const batch = batchCount > 1 ? ` — batch ${batchNumber} of ${batchCount}` : '';
    await this.print.printDocument(
      `Barcode labels${batch}`,
      `<main class="label-sheet ${layout}">${labels.join('')}</main>`,
      this.styles(layout)
    );
  }

  private labelHtml(variant: Variant, barcode: string, svg: string): string {
    const variantName =
      variant.variant_name && variant.variant_name !== 'Default'
        ? `<div class="variant">${this.escape(variant.variant_name)}</div>`
        : '';
    const sku = variant.sku ? `<div class="sku">SKU ${this.escape(variant.sku)}</div>` : '';
    return `
      <article class="barcode-label">
        <div class="product">${this.escape(variant.product_name ?? '')}</div>
        ${variantName}
        ${sku}
        <div class="barcode-graphic">${svg}</div>
        <div class="barcode-value">${this.escape(barcode)}</div>
      </article>`;
  }

  private styles(layout: BarcodeLabelLayout): string {
    const common = `
      .label-sheet { background: #fff; color: #000; }
      .barcode-label { overflow: hidden; break-inside: avoid; display: flex; flex-direction: column;
        justify-content: center; font-family: Arial, sans-serif; }
      .product { font-size: 10pt; line-height: 1.1; font-weight: 700; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis; }
      .variant, .sku { font-size: 7.5pt; line-height: 1.15; white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis; }
      .barcode-graphic { min-width: 0; margin-top: 1mm; text-align: center; }
      .barcode-graphic svg { display: block; width: 100%; max-width: 100%; height: 12mm; }
      .barcode-value { margin-top: .5mm; text-align: center; font: 7.5pt/1.1 monospace;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    `;
    if (layout === 'compact-roll') {
      return `${common}
        @page { size: 50mm 30mm; margin: 0; }
        .label-sheet { width: 50mm; }
        .barcode-label { width: 50mm; height: 30mm; padding: 2mm 3mm; page-break-after: always; }
        .barcode-label:last-child { page-break-after: auto; }
      `;
    }
    return `${common}
      @page { size: A4 portrait; margin: 8mm; }
      .label-sheet { display: grid; grid-template-columns: repeat(3, 1fr); width: 194mm; }
      .barcode-label { height: 39.9mm; padding: 3mm 4mm; border: .2mm solid #ddd; }
    `;
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

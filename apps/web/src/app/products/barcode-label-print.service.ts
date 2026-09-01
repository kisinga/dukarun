import { Injectable, inject } from '@angular/core';
import type { Variant } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import {
  barcodeLabelPageStyles,
  barcodeLabelPrintableWidth,
  type BarcodeLabelLayout,
} from './barcode-label-presets';

export type { BarcodeLabelLayout } from './barcode-label-presets';

/** Thermal printers are 203 dpi; bars must land on whole dots to stay scannable. */
const THERMAL_DOT_MM = 25.4 / 203;
const MIN_MODULE_DOTS = 2;
const MAX_MODULE_DOTS = 4;

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
        return [this.labelHtml(variant, barcode, this.sizeBarcodeSvg(svg, layout))];
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

  async printTestLabel(layout: BarcodeLabelLayout): Promise<void> {
    await this.printLabels(
      [
        {
          variant_id: 'test-label',
          company_id: '',
          product_id: '',
          product_name: 'DukaRun test label',
          variant_name: 'Printer setup',
          kind: 'good',
          sku: 'TEST-001',
          barcode: 'DRTEST123456',
          price: 0,
          wholesale_price: null,
          allow_fractional: false,
          track_inventory: false,
          variant_active: true,
          product_active: true,
          image_path: null,
          stock: 0,
          manufacturer_id: null,
          manufacturer_name: null,
        },
      ],
      layout,
      1,
      1
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

  /**
   * Pins the SVG to an explicit mm width so one module is a whole number of
   * printer dots. Forcing width:100% (the old behaviour) shrank Code128 bars
   * to fractional dot widths, which rasterised into mush on thermal printers.
   *
   * Design-guard exception: this is machine-generated Code128 geometry, not a
   * UI icon. Keeping it as vector output is required for thermal print fidelity;
   * the two markup tokens used below are ratcheted in the guard allowlist.
   */
  private sizeBarcodeSvg(svg: string, layout: BarcodeLabelLayout): string {
    const viewBox = /viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!viewBox) return svg;
    const units = Number(viewBox[1]);
    const usable = barcodeLabelPrintableWidth(layout);
    const fitDots = Math.floor(usable / (units * THERMAL_DOT_MM));
    const widthMm =
      fitDots >= MIN_MODULE_DOTS
        ? units * Math.min(fitDots, MAX_MODULE_DOTS) * THERMAL_DOT_MM
        : usable; // too long even at the minimum module width — best effort fit
    return svg.replace('<svg ', `<svg style="width:${widthMm.toFixed(2)}mm;height:auto" `);
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
      .barcode-graphic svg { display: inline-block; height: auto; }
      .barcode-value { margin-top: .5mm; text-align: center; font: 7.5pt/1.1 monospace;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    `;
    return common + barcodeLabelPageStyles(layout);
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

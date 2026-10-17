import type { PrintJob, RenderedDocument } from '@dukarun/documents';
import { openEscIntent, openEscPages, OpenEscSizeError } from '../shared/print/open-esc';
import { Injectable, inject } from '@angular/core';
import type { Variant } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { OpenEscPrintService } from '../shared/print/open-esc-print.service';
import {
  barcodeLabelPageStyles,
  barcodeLabelPrintableWidth,
  type BarcodeLabelLayout,
} from './barcode-label-presets';

export type BarcodeRotation = 0 | 90;
export type BarcodeDirection = BarcodeRotation | 'auto';
export type { BarcodeLabelLayout } from './barcode-label-presets';

/** Thermal printers are 203 dpi; bars must land on whole dots to stay scannable. */
const MIN_MODULE_DOTS = 2;
const MAX_MODULE_DOTS = 4;

export interface BarcodeLabelRenderFailure {
  variant: Variant;
  message: string;
}

export class BarcodeLabelRenderError extends Error {
  constructor(readonly failures: BarcodeLabelRenderFailure[]) {
    super(
      `Could not prepare barcode labels. ${[...new Set(failures.map(failure => failure.message))].slice(0, 3).join(' ')}`
    );
    this.name = 'BarcodeLabelRenderError';
  }
}

@Injectable({ providedIn: 'root' })
export class BarcodeLabelPrintService {
  private readonly print = inject(PrintService);
  private readonly printer = inject(OpenEscPrintService);

  async renderLabels(
    variants: readonly Variant[],
    layout: BarcodeLabelLayout,
    batchNumber: number,
    batchCount: number,
    boundForOpenEsc = false,
    rotation: BarcodeDirection = 'auto'
  ): Promise<PrintJob> {
    const profile = boundForOpenEsc ? this.printer.profile() : null;
    const rasterWidthDots = profile
      ? Math.floor((profile.widthCm / 2.54) * profile.dpi)
      : undefined;
    const dpi = profile?.dpi ?? 203;
    const usableWidth = rasterWidthDots
      ? (rasterWidthDots * 25.4) / dpi - 6
      : barcodeLabelPrintableWidth(layout);
    let rotatedHeight = 0;
    const bwip = await import('bwip-js/browser');
    const failures: BarcodeLabelRenderFailure[] = [];
    const graphics = new Map<string, string>();
    const encoded = variants.flatMap(variant => {
      const barcode = variant.barcode?.trim();
      if (!barcode) {
        failures.push({ variant, message: 'Barcode is missing.' });
        return [];
      }
      try {
        const svg =
          graphics.get(barcode) ??
          bwip.toSVG({
            bcid: 'code128',
            text: barcode,
            scale: 2,
            height: 10,
            includetext: false,
            paddingwidth: 10,
            paddingheight: 1,
            backgroundcolor: 'FFFFFF',
          });
        graphics.set(barcode, svg);
        return [{ variant, barcode, svg }];
      } catch (error) {
        failures.push({
          variant,
          message: error instanceof Error ? error.message : 'Code 128 cannot encode this value.',
        });
        return [];
      }
    });
    const rotate =
      layout !== 'a4-grid' &&
      (rotation === 90 ||
        (rotation === 'auto' &&
          encoded.some(
            ({ svg }) => this.barcodeModules(svg) * (25.4 / dpi) * MIN_MODULE_DOTS > usableWidth
          )));
    const labels = encoded.flatMap(({ variant, barcode, svg }) => {
      try {
        const graphic = this.sizeBarcodeSvg(svg, usableWidth, dpi, rotate);
        const width = Number(/width:([\d.]+)mm/.exec(graphic)?.[1]);
        const contentLength = Math.ceil(width + 1);
        if (rotate) rotatedHeight = Math.max(rotatedHeight, contentLength + 4);
        return [this.labelHtml(variant, barcode, graphic, rotate, contentLength, usableWidth)];
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
    const media: RenderedDocument['print'] =
      layout === 'a4-grid'
        ? { kind: 'sheet', widthMm: 210, heightMm: 297 }
        : {
            kind: 'roll-label',
            rasterWidthDots,
            dpi,
            widthMm: layout === '80mm-roll' ? 80 : layout === '58mm-roll' ? 58 : 50,
            heightMm: Math.max(layout === '80mm-roll' ? 40 : 30, Math.ceil(rotatedHeight)),
          };
    const title = `Barcode labels${batch}`;
    const styles =
      this.styles(layout) +
      (rotate && media.kind === 'roll-label'
        ? ` @page { size:${media.widthMm}mm ${media.heightMm}mm; margin:0; } .barcode-label {height:${media.heightMm}mm;} `
        : '');
    const makeJob = (count: number): PrintJob => ({
      title,
      styles,
      print: media,
      itemCount: count,
      html: `<main class="label-sheet ${layout}">${labels.slice(0, count).join('')}</main>`,
      pages:
        media.kind === 'roll-label'
          ? labels.slice(0, count).map(label => ({
              title,
              styles,
              print: media,
              html: `<main class="label-sheet ${layout}">${label}</main>`,
            }))
          : undefined,
    });
    if (!boundForOpenEsc || media.kind === 'sheet') return makeJob(labels.length);
    // Cap the actual transport, not just the count; one tap hands off exactly this prefix.
    let low = 1,
      high = labels.length,
      fitting = 0;
    while (low <= high) {
      const count = Math.floor((low + high) / 2);
      try {
        await openEscIntent(openEscPages(makeJob(count)));
        fitting = count;
        low = count + 1;
      } catch (error) {
        if (!(error instanceof OpenEscSizeError)) throw error;
        high = count - 1;
      }
    }
    if (!fitting)
      throw new Error('This label exceeds the Open ESC size limit. Use system printing.');
    return makeJob(fitting);
  }

  async printLabels(
    variants: readonly Variant[],
    layout: BarcodeLabelLayout,
    batchNumber: number,
    batchCount: number,
    rotation: BarcodeDirection = 'auto'
  ): Promise<void> {
    await this.print.printRendered(
      await this.renderLabels(variants, layout, batchNumber, batchCount, false, rotation)
    );
  }

  async renderTestLabel(
    layout: BarcodeLabelLayout,
    rotation: BarcodeDirection = 'auto',
    boundForOpenEsc = false
  ): Promise<PrintJob> {
    return this.renderLabels(
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
      1,
      boundForOpenEsc,
      rotation
    );
  }

  async printTestLabel(
    layout: BarcodeLabelLayout,
    rotation: BarcodeDirection = 'auto'
  ): Promise<void> {
    await this.print.printRendered(await this.renderTestLabel(layout, rotation));
  }

  private labelHtml(
    variant: Variant,
    barcode: string,
    svg: string,
    rotate: boolean,
    contentLength: number,
    usableWidth: number
  ): string {
    const variantName =
      variant.variant_name && variant.variant_name !== 'Default'
        ? `<div class="variant">${this.escape(variant.variant_name)}</div>`
        : '';
    const sku = variant.sku ? `<div class="sku">SKU ${this.escape(variant.sku)}</div>` : '';
    const rotation = rotate
      ? ` style="width:${contentLength}mm;height:${usableWidth.toFixed(6)}mm;top:calc(50% - ${contentLength / 2}mm)"`
      : '';
    return `
      <article class="barcode-label${rotate ? ' label-rotated' : ''}">
        <div class="label-content"${rotation}>
        <div class="product">${this.escape(variant.product_name ?? '')}</div>
        ${variantName}
        ${sku}
        <div class="barcode-graphic">${svg}</div>
        <div class="barcode-value">${this.escape(barcode)}</div>
        </div>
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
  private sizeBarcodeSvg(svg: string, usable: number, dpi: number, rotate: boolean): string {
    const modules = this.barcodeModules(svg);
    const dotMm = 25.4 / dpi;
    const fitDots = rotate ? MIN_MODULE_DOTS : Math.floor(usable / (modules * dotMm));
    if (fitDots < MIN_MODULE_DOTS)
      throw new Error(
        `This barcode needs at least ${(modules * dotMm * MIN_MODULE_DOTS).toFixed(1)} mm across, but this layout has ${usable.toFixed(1)} mm. For roll labels, choose Label direction: Rotate 90°, or choose a wider layout.`
      );
    const widthMm = modules * Math.min(fitDots, MAX_MODULE_DOTS) * dotMm;
    return svg.replace(
      '<svg ',
      `<svg style="width:${widthMm.toFixed(6)}mm;height:auto;shape-rendering:crispEdges" `
    );
  }

  private barcodeModules(svg: string): number {
    const viewBox = /viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!viewBox) throw new Error('The barcode dimensions could not be read.');
    // scale:2 emits two SVG units for one narrow Code128 bar.
    return Number(viewBox[1]) / 2;
  }

  private styles(layout: BarcodeLabelLayout): string {
    const common = `
      .label-sheet { background: #fff; color: #000; }
      .barcode-label { overflow: hidden; break-inside: avoid; display: flex; flex-direction: column;
        justify-content: center; font-family: Arial, sans-serif; }
      .label-content { min-width:0; }
      .barcode-label.label-rotated { position:relative; display:block; padding:0; }
      .label-rotated .label-content { position:absolute; left:calc(100% - 3mm);
        display:flex; flex-direction:column; justify-content:center;
        transform-origin:top left; transform:rotate(90deg); }
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

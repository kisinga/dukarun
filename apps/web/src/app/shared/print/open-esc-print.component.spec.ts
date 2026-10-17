import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrintJob, RenderedDocument } from '@dukarun/documents';
import { OpenEscPrintService } from './open-esc-print.service';
import { OpenEscDialogComponent } from './open-esc-dialog.component';
import { PrinterSettingsComponent } from './printer-settings.component';
import { PreparedPrintDirective } from './prepared-print.directive';
import { openEscCalibration } from './open-esc';
import { PrintService } from './print.service';
import { ReceiptDataService } from './receipt-data.service';
import {
  BarcodeLabelPrintService,
  BarcodeLabelRenderError,
} from '../../products/barcode-label-print.service';
import type { Variant } from '../../pos/pos.service';

@Component({
  imports: [OpenEscDialogComponent, PrinterSettingsComponent, PreparedPrintDirective],
  template:
    '<button [appPrintDocument]="doc()" (click)="system()">Print</button><app-printer-settings /><app-open-esc-dialog />',
})
class HostComponent {
  readonly doc = signal<RenderedDocument>(openEscCalibration());
  readonly system = vi.fn();
}

@Component({
  imports: [PreparedPrintDirective],
  template: '@for (id of ids; track id) { <button [appPrintOrder]="id">Print</button> }',
})
class QueueHostComponent {
  readonly ids = ['one', 'two', 'three', 'four', 'five'];
}

describe('Prepared device printing', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('dukarun-print-method');
    localStorage.removeItem('dukarun-print-format');
    localStorage.removeItem('dukarun-print-profile');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.getElementById('print-frame')?.remove();
  });
  async function setup(android = true, method = 'open-esc') {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      android ? 'Android Chrome/120' : 'Desktop Chrome'
    );
    vi.stubGlobal('IntersectionObserver', undefined);
    localStorage.setItem('dukarun-print-method', method);
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: ReceiptDataService, useValue: { printRevision: signal(0) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return {
      fixture,
      printer: TestBed.inject(OpenEscPrintService),
      print: TestBed.inject(PrintService),
      button: fixture.nativeElement.querySelector('button') as HTMLButtonElement,
    };
  }
  async function ready(fixture: Awaited<ReturnType<typeof setup>>['fixture']) {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('button').dataset.printState).toBe('ready');
    });
  }
  it('hides Open ESC on desktop and retains all document sizes', async () => {
    const { fixture, printer, print } = await setup(false);
    expect(fixture.nativeElement.querySelector('option[value="open-esc"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('select option').length).toBe(3);
    printer.setMethod('open-esc');
    print.setFormat('receipt-80mm');
    expect(new OpenEscPrintService().method()).toBe('open-esc');
    expect(localStorage.getItem('dukarun-print-format')).toBe('receipt-80mm');
  });
  it('prepares silently and launches synchronously from the first print tap on pre-138 Chrome', async () => {
    const { fixture, printer, button } = await setup();
    const launch = vi.spyOn(printer, 'launch').mockImplementation(() => undefined);
    await ready(fixture);
    expect(launch).not.toHaveBeenCalled();
    expect(printer.pending()).toBeNull();
    button.click();
    expect(launch).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.system).not.toHaveBeenCalled();
    expect(printer.pending()).toBeNull();
    button.click();
    expect(launch).toHaveBeenCalledOnce();
  });
  it('never hands a job off after cancellation or a document change', async () => {
    const { fixture, printer, button } = await setup();
    let resolve!: (job: { job: PrintJob; intentUrl: string }) => void;
    vi.spyOn(printer, 'prepare').mockImplementationOnce(
      () => new Promise(done => (resolve = done))
    );
    // Trigger a new preparation after replacing the initial job.
    fixture.componentInstance.doc.set({ ...openEscCalibration(), title: 'Old' });
    fixture.detectChanges();
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    fixture.componentInstance.doc.set({ ...openEscCalibration(), title: 'New' });
    fixture.detectChanges();
    await ready(fixture);
    resolve({ job: { ...openEscCalibration(), title: 'Old' }, intentUrl: 'intent://old' });
    await Promise.resolve();
    const launch = vi.spyOn(printer, 'launch').mockImplementation(() => undefined);
    button.click();
    expect(launch.mock.calls[0][0].job.title).toBe('New');
  });
  it('shows errors only when printing is requested and offers an explicit system fallback', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const { fixture, printer, print, button } = await setup();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(button.getAttribute('aria-busy')).toBeNull();
    });
    expect(printer.pending()).toBeNull();
    button.click();
    fixture.detectChanges();
    expect(printer.pending()?.error).toContain('updated Android Chrome');
    const fallback = vi.spyOn(print, 'systemPrint').mockResolvedValue();
    await printer.useSystemPrinter();
    expect(fallback).toHaveBeenCalledOnce();
    expect(printer.pending()).toBeNull();
  });
  it('limits order preparation to two jobs and cancels queued work when the view closes', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android Chrome/120');
    vi.stubGlobal('IntersectionObserver', undefined);
    localStorage.setItem('dukarun-print-method', 'open-esc');
    const pending: Array<(value: RenderedDocument) => void> = [];
    const prepareOrder = vi.fn(
      () => new Promise<RenderedDocument>(resolve => pending.push(resolve))
    );
    TestBed.configureTestingModule({
      imports: [QueueHostComponent],
      providers: [
        { provide: PrintService, useValue: { format: signal('receipt-52mm'), prepareOrder } },
        { provide: ReceiptDataService, useValue: { printRevision: signal(0) } },
      ],
    });
    const fixture = TestBed.createComponent(QueueHostComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(prepareOrder).toHaveBeenCalledTimes(2));
    fixture.destroy();
    pending.forEach(resolve => resolve(openEscCalibration()));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(prepareOrder).toHaveBeenCalledTimes(2);
  });
  it('keeps A4 order actions on system printing without background order preparation', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android Chrome/120');
    vi.stubGlobal('IntersectionObserver', undefined);
    localStorage.setItem('dukarun-print-method', 'open-esc');
    const prepareOrder = vi.fn();
    TestBed.configureTestingModule({
      imports: [QueueHostComponent],
      providers: [
        { provide: PrintService, useValue: { format: signal('a4'), prepareOrder } },
        { provide: ReceiptDataService, useValue: { printRevision: signal(0) } },
      ],
    });
    const fixture = TestBed.createComponent(QueueHostComponent);
    fixture.detectChanges();
    await Promise.resolve();
    expect(prepareOrder).not.toHaveBeenCalled();
    const click = vi.fn();
    const button = fixture.nativeElement.querySelector('button');
    button.addEventListener('click', click);
    button.click();
    expect(click).toHaveBeenCalledOnce();
  });
  it('persists the matching printer profile and rejects invalid dimensions', async () => {
    const { printer } = await setup(false);
    printer.setProfile(4.8, 203);
    expect(new OpenEscPrintService().profile()).toEqual({ widthCm: 4.8, dpi: 203 });
    printer.setProfile(0, 203);
    printer.setProfile(5, NaN);
    expect(printer.profile()).toEqual({ widthCm: 4.8, dpi: 203 });
  });
  it('lets A4 sheets use the original system action without changing the saved method', async () => {
    const { fixture, printer, button } = await setup();
    fixture.componentInstance.doc.set({
      title: 'A4',
      html: '<main>Letter</main>',
      styles: '',
      print: { kind: 'sheet', widthMm: 210, heightMm: 297 },
    });
    fixture.detectChanges();
    button.click();
    expect(fixture.componentInstance.system).toHaveBeenCalledOnce();
    expect(printer.method()).toBe('open-esc');
  });
  it('does not close a newer error when a cancelled fallback finishes', async () => {
    const { printer } = await setup(false);
    let finish!: () => void;
    printer.fail('Old', new Error('Old'), () => new Promise(done => (finish = done)));
    const old = printer.useSystemPrinter();
    printer.close();
    printer.fail('New', new Error('New'));
    finish();
    await old;
    expect(printer.pending()?.title).toBe('New');
  });
  it('keeps roll labels separate and fixes scale-two barcode module geometry', async () => {
    await setup(false);
    const labels = TestBed.inject(BarcodeLabelPrintService);
    const variant = {
      variant_id: 'one',
      product_name: 'Tea',
      variant_name: 'Default',
      barcode: 'DRTEST123456',
      sku: 'TEA',
    } as Variant;
    const job = await labels.renderLabels([variant, variant], '58mm-roll', 1, 1, true);
    expect(job.print?.kind).toBe('roll-label');
    expect(job.pages).toHaveLength(2);
    expect(job.html).toContain('width:41.290640mm');
    const rotated = await labels.renderLabels([variant], '58mm-roll', 1, 1, false, 90);
    const parsed = new DOMParser().parseFromString(rotated.html, 'text/html');
    const content = parsed.querySelector('.label-rotated .label-content');
    expect(content?.querySelector('.product')?.textContent).toBe('Tea');
    expect(content?.querySelector('.sku')?.textContent).toBe('SKU TEA');
    expect(content?.querySelector('.barcode-value')?.textContent).toBe('DRTEST123456');
    expect(content?.querySelector('svg')).not.toBeNull();
    expect(rotated.styles).toContain('transform:rotate(90deg)');
    expect(rotated.print?.kind === 'roll-label' && rotated.print.heightMm).toBeGreaterThan(30);
    const a4 = await labels.renderLabels([variant], 'a4-grid', 1, 1, false, 90);
    expect(a4.print?.kind).toBe('sheet');
    expect(a4.html).not.toContain('label-rotated');
  });
  it('rejects an unreadably narrow barcode and allows rotation on a roll', async () => {
    await setup(false);
    const labels = TestBed.inject(BarcodeLabelPrintService);
    const variant = {
      variant_id: 'long',
      product_name: 'Long code',
      barcode: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    } as Variant;
    await expect(
      labels.renderLabels([variant], 'compact-roll', 1, 1, false, 0)
    ).rejects.toBeInstanceOf(BarcodeLabelRenderError);
    await expect(labels.renderLabels([variant], 'compact-roll', 1, 1, false, 0)).rejects.toThrow(
      'Label direction: Rotate 90°'
    );
    const rotated = await labels.renderLabels([variant], 'compact-roll', 1, 1, false, 90);
    expect(rotated.html).toContain('label-rotated');
  });
  it('fits generated alphanumeric DukaRun codes along a narrow roll after rotation', async () => {
    const { printer } = await setup(false);
    printer.setProfile(5, 203);
    const labels = TestBed.inject(BarcodeLabelPrintService);
    const variant = {
      variant_id: 'generated',
      product_name: 'Tea',
      barcode: 'DRABCDEFABCDEF',
    } as Variant;
    await expect(labels.renderLabels([variant], '58mm-roll', 1, 1, true, 0)).rejects.toThrow(
      'needs at least 52.3 mm across, but this layout has 43.9 mm'
    );
    const rotated = await labels.renderLabels([variant], '58mm-roll', 1, 1, true, 90);
    expect(rotated.pages).toHaveLength(1);
    expect(rotated.print?.kind === 'roll-label' && rotated.print.heightMm).toBeGreaterThan(52);
    const content = new DOMParser()
      .parseFromString(rotated.html, 'text/html')
      .querySelector('.label-rotated .label-content');
    expect(content?.textContent).toContain('Tea');
    expect(content?.textContent).toContain('DRABCDEFABCDEF');
  });
  it('automatically fits the whole roll batch and preserves copy order without changing the preference', async () => {
    const { printer } = await setup(false);
    printer.setProfile(5, 203);
    const labels = TestBed.inject(BarcodeLabelPrintService);
    const short = { variant_id: 'short', product_name: 'Tea', barcode: '123456' } as Variant;
    const long = { ...short, variant_id: 'long', barcode: 'DRABCDEFABCDEF' };
    const standard = await labels.renderLabels([short], '58mm-roll', 1, 1, true);
    expect(standard.html).not.toContain('label-rotated');
    const rotated = await labels.renderLabels([short, long, short], '58mm-roll', 1, 1, true);
    expect(rotated.pages).toHaveLength(3);
    expect(rotated.itemCount).toBe(3);
    for (const page of rotated.pages!) expect(page.html).toContain('label-rotated');
    const codes = new DOMParser()
      .parseFromString(rotated.html, 'text/html')
      .querySelectorAll('.barcode-value');
    expect(Array.from(codes, code => code.textContent)).toEqual([
      '123456',
      'DRABCDEFABCDEF',
      '123456',
    ]);
    const wider = await labels.renderLabels([long], '80mm-roll', 1, 1, false);
    expect(wider.html).not.toContain('label-rotated');
    const actualNarrowPrinter = await labels.renderLabels([long], '80mm-roll', 1, 1, true);
    expect(actualNarrowPrinter.html).toContain('label-rotated');
    const a4 = await labels.renderLabels([long], 'a4-grid', 1, 1);
    expect(a4.html).not.toContain('label-rotated');
    expect(a4.print?.kind).toBe('sheet');
    expect(localStorage.getItem('dukarun-barcode-label-rotation')).toBeNull();
  });
});

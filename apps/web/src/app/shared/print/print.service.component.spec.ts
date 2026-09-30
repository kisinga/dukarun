import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultDesign } from '@dukarun/documents';
import { ReceiptDataService } from './receipt-data.service';
import type { OrderData } from './print-data';
import { PrintService } from './print.service';

@Component({ template: '' })
class PrintServiceHostComponent {
  readonly printService = inject(PrintService);
}

describe('PrintService', () => {
  afterEach(() => {
    document.getElementById('print-frame')?.remove();
  });

  it('prints through an isolated document and blocks overlapping preparation', async () => {
    await TestBed.configureTestingModule({
      imports: [PrintServiceHostComponent],
      providers: [{ provide: ReceiptDataService, useValue: {} }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PrintServiceHostComponent);
    fixture.detectChanges();
    const service = fixture.componentInstance.printService;
    const firstPrint = service.printDocument(
      'Statement <Amina>',
      '<main class="print-template">Statement body</main>',
      '.print-template { color: black; }'
    );
    const overlappingPrint = service.printDocument('Second document', '<main>Second</main>', '');

    await expect(overlappingPrint).rejects.toThrow('already being prepared');

    const frame = document.getElementById('print-frame') as HTMLIFrameElement;
    const print = vi.fn();
    const focus = vi.fn();
    Object.defineProperty(frame.contentWindow, 'print', { configurable: true, value: print });
    Object.defineProperty(frame.contentWindow, 'focus', { configurable: true, value: focus });

    await firstPrint;

    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.contentDocument?.title).toBe('Statement <Amina>');
    expect(frame.contentDocument?.body.textContent).toContain('Statement body');
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
  });
});

describe('PrintService document VAT presentation', () => {
  afterEach(() => TestBed.resetTestingModule());
  it.each([true, false])(
    'applies receipt override %s ahead of the inherited preference',
    async show => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: ReceiptDataService,
            useValue: {
              companyPrintInfo: vi.fn().mockResolvedValue({
                name: 'Shop',
                showVatBreakdown: !show,
                documentDesigns: {
                  receipt: { ...defaultDesign('receipt'), showVatBreakdown: show },
                },
              }),
            },
          },
        ],
      });
      const service = TestBed.inject(PrintService);
      const print = vi.spyOn(service, 'printDocument').mockResolvedValue();
      await service.printOrder(
        {
          id: 'order',
          code: 'SALE-1',
          state: 'Fulfilled',
          totalWithTax: 116,
          netTotal: 100,
          taxTotal: 16,
          currencyCode: 'KES',
          lines: [],
          createdAt: '2026-09-01',
        } as unknown as OrderData,
        'Shop',
        null,
        { documentType: 'receipt', vatRegistered: true, showVatBreakdown: !show }
      );
      const html = print.mock.calls[0][1];
      expect(html.includes('Net amount')).toBe(show);
      expect(html).toContain('KES 116');
      expect(html).not.toContain('data-preview-active');
    }
  );
});

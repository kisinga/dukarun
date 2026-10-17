import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderDocument, defaultDesign } from '@dukarun/documents';
import { DocumentComponent } from './document.component';
import { DocumentViewComponent } from './document-view.component';
import { StorefrontService } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';

const content = {
  kind: 'receipt' as const,
  identity: { name: 'Shop' },
  reference: 'SALE-1',
  metadata: [],
  sections: [],
  totals: [{ label: 'Total', value: 'KES 100' }],
};
describe('public document printing', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.removeItem('dukarun-print-method');
  });
  it.each(['receipt-52mm', 'receipt-80mm', undefined] as const)(
    'uses the selected mobile format or the A4 default for %s',
    async paper => {
      const snapshot = {
        paper_format: paper,
        document_type: 'receipt',
        document_number: 'SALE-1',
        company_name: 'Shop',
        company_logo_path: null,
        company_address: null,
        company_whatsapp: null,
        party_name: 'Amina',
        issue_date: '2026-10-16',
        valid_until: null,
        total: 100,
        paid: 100,
        balance: 0,
        status: 'Paid',
        notes: null,
        lines: [{ description: 'Tea', quantity: 2, unit_price: 50, line_total: 100 }],
        expires_at: '2026-11-16',
        document_design: defaultDesign('receipt'),
      };
      TestBed.configureTestingModule({
        imports: [DocumentComponent],
        providers: [
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'token' } } } },
          {
            provide: StorefrontService,
            useValue: {
              externalDocument: vi.fn().mockResolvedValue(snapshot),
              companyLogoUrl: () => null,
              legalUrl: () => '/privacy',
            },
          },
          { provide: StorefrontSeoService, useValue: { set: vi.fn() } },
        ],
      });
      const fixture = TestBed.createComponent(DocumentComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const rendered = fixture.componentInstance['rendered']()!;
      expect(rendered.print?.kind).toBe(paper ? 'thermal-document' : 'sheet');
      if (paper) {
        expect(rendered.styles).toContain('font:10.5pt');
        expect(rendered.html).toContain('data-label="Qty"');
      }
    }
  );
  it('prepares ahead of time and hands off synchronously on Android Chrome before version 138', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android Chrome/120');
    localStorage.setItem('dukarun-print-method', 'open-esc');
    TestBed.configureTestingModule({ imports: [DocumentViewComponent] });
    const fixture = TestBed.createComponent(DocumentViewComponent);
    fixture.componentRef.setInput(
      'document',
      renderDocument(content, defaultDesign('receipt'), 'receipt-52mm')
    );
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance['prepared']).not.toBeNull();
    });
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    const printing = fixture.componentInstance.print();
    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('intent://'));
    await printing;
    vi.unstubAllGlobals();
  });
  it('hides Android printer options on desktop', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Desktop Chrome');
    TestBed.configureTestingModule({ imports: [DocumentViewComponent] });
    const fixture = TestBed.createComponent(DocumentViewComponent);
    fixture.componentRef.setInput(
      'document',
      renderDocument(content, defaultDesign('receipt'), 'receipt-52mm')
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('option[value="open-esc"]')).toBeNull();
  });
});

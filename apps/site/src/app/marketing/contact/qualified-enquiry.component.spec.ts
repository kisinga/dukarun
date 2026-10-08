import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QualifiedEnquiryComponent } from './qualified-enquiry.component';
import { PublicPricingService } from '../public-pricing.service';

describe('QualifiedEnquiryComponent', () => {
  afterEach(() => vi.restoreAllMocks());
  async function render() {
    const params = new BehaviorSubject(
      convertToParamMap({ intent: 'setup', from: '/blog/stock', utm_source: 'group' })
    );
    await TestBed.configureTestingModule({
      imports: [QualifiedEnquiryComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        {
          provide: PublicPricingService,
          useValue: {
            activePlans: () => Promise.reject(new Error('offline')),
            billingConfig: () => Promise.reject(new Error('offline')),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(QualifiedEnquiryComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, params, el: fixture.nativeElement as HTMLElement };
  }
  function complete(el: HTMLElement) {
    const values = {
      businessType: 'Electricals & lighting',
      locations: '1',
      staff: '1–3',
      need: 'Stock',
      records: 'Notebook',
      timing: 'Within 30 days',
      assistance: 'Self-start',
    };
    for (const [name, value] of Object.entries(values)) {
      const control = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#enquiry-${name}`)!;
      control.value = value;
      control.dispatchEvent(
        new Event(name === 'businessType' ? 'input' : 'change', { bubbles: true })
      );
    }
  }
  it('shows accessible inline errors and pricing fallback without opening WhatsApp', async () => {
    const { fixture, el } = await render();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(el.querySelectorAll('[aria-invalid="true"]')).toHaveLength(7);
    expect(el.textContent).toContain('confirm the current subscription price');
    expect(open).not.toHaveBeenCalled();
  });
  it('preserves answers when intent changes and prepares encoded WhatsApp context', async () => {
    const { fixture, params, el } = await render();
    complete(el);
    fixture.detectChanges();
    params.next(convertToParamMap({ intent: 'demo', from: '/tools/daily-shop-cash-up' }));
    fixture.detectChanges();
    expect([...new FormData(el.querySelector('form')!).keys()]).toEqual(['intent']);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const url = open.mock.calls[0][0] as string;
    expect(new URL(url).searchParams.get('text')).toContain('Electricals & lighting');
    expect(new URL(url).searchParams.get('text')).toContain('Source: /tools/daily-shop-cash-up');
    expect(new URL(url).searchParams.get('text')).toContain('like a demo');
  });
  it('provides a manual copy fallback when clipboard is unavailable', async () => {
    const { fixture, el } = await render();
    complete(el);
    fixture.detectChanges();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const button = [...el.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Copy message')
    )!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector<HTMLTextAreaElement>('#enquiry-copy')?.value).toContain(
      'Business type: Electricals & lighting'
    );
    expect(el.textContent).toContain('copy it manually');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  heroArrowRight,
  heroCheckCircle,
  heroPrinter,
  heroShare,
} from '@ng-icons/heroicons/outline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyShopCashUpComponent } from './daily-shop-cash-up.component';

describe('DailyShopCashUpComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function render() {
    await TestBed.configureTestingModule({
      imports: [DailyShopCashUpComponent],
      providers: [
        provideRouter([]),
        provideIcons({ heroArrowRight, heroCheckCircle, heroPrinter, heroShare }),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DailyShopCashUpComponent);
    fixture.detectChanges();
    return fixture;
  }

  function enter(fixture: Awaited<ReturnType<typeof render>>, id: string, value: string): void {
    const input = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function button(fixture: Awaited<ReturnType<typeof render>>, label: string): HTMLButtonElement {
    return [...fixture.nativeElement.querySelectorAll('button')].find(element =>
      element.textContent.includes(label)
    ) as HTMLButtonElement;
  }

  it('uses clear public language and explains that entered values are not stored', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Close the day with the numbers clear.');
    expect(text).toContain('Nothing is saved');
    expect(text).toContain('A difference is a prompt to review the records.');
    expect(text).not.toContain('—');
  });

  it('uses specific product, WhatsApp, and related-guide calls to action', async () => {
    const fixture = await render();
    const anchors = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    const findLink = (label: string) =>
      anchors.find(anchor => anchor.textContent.includes(label)) as HTMLAnchorElement;

    expect(findLink('See how Dukarun closes the day').href).toContain('/docs#cashier-sessions');
    expect(findLink('Talk through my shop closing').href).toContain('wa.me/254788922222');
    expect(findLink('Talk through my shop closing').href).toContain('shop%20closing');
    expect(findLink('how to tell whether the shop made money today').href).toContain(
      '/blog/how-to-know-shop-profit-kenya'
    );
  });

  it('updates the closing summary and labels an overage without assigning a cause', async () => {
    const fixture = await render();
    enter(fixture, 'cash-up-openingCash', '1000');
    enter(fixture, 'cash-up-cashSales', '2000');
    enter(fixture, 'cash-up-actualClosingCash', '3100');

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('KES 3,000');
    expect(text).toContain('+KES 100');
    expect(text).toContain('higher than expected');
  });

  it('shows an accessible validation error and recovers after reset', async () => {
    const fixture = await render();
    enter(fixture, 'cash-up-cashSales', '-50');

    const input = fixture.nativeElement.querySelector('#cash-up-cashSales') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('positive amount');

    button(fixture, 'Reset figures').click();
    fixture.detectChanges();
    expect(input.value).toBe('');
  });

  it('prints a valid entered summary', async () => {
    const fixture = await render();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    enter(fixture, 'cash-up-openingCash', '1000');

    button(fixture, 'Print summary').click();
    expect(print).toHaveBeenCalledOnce();
  });

  it('shares only the canonical tool link and no entered figures', async () => {
    const fixture = await render();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    enter(fixture, 'cash-up-cashSales', '12345');

    button(fixture, 'Share tool').click();
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());

    const payload = share.mock.calls[0][0];
    expect(payload.url).toContain('/tools/daily-shop-cash-up');
    expect(JSON.stringify(payload)).not.toContain('12345');
  });

  it('copies only the canonical URL when native sharing is unavailable', async () => {
    const fixture = await render();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    enter(fixture, 'cash-up-cashSales', '98765');

    button(fixture, 'Share tool').click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());

    expect(writeText.mock.calls[0][0]).toContain('/tools/daily-shop-cash-up');
    expect(writeText.mock.calls[0][0]).not.toContain('98765');
  });
});

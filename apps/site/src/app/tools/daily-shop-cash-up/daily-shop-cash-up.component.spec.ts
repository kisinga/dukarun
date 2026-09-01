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

  function continueTo(fixture: Awaited<ReturnType<typeof render>>, step: 2 | 3): void {
    while (fixture.nativeElement.textContent.includes(`Step ${step - 1} of 3`)) {
      button(fixture, 'Continue').click();
      fixture.detectChanges();
    }
  }

  it('uses clear public language and explains that entered values are not stored', async () => {
    const fixture = await render();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Do today’s money and sales agree?');
    expect(text).toContain('Nothing is saved');
    expect(text).toContain('A blank closing figure will stay “Not checked”');
    expect(text).not.toContain('—');
  });

  it('offers self-start, assisted setup, and a related guide', async () => {
    const fixture = await render();
    const anchors = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    const findLink = (label: string) =>
      anchors.find(anchor => anchor.textContent.includes(label)) as HTMLAnchorElement;

    expect(findLink('Start my shop').href).toContain('/register');
    expect(findLink('I need setup and training').href).toContain('wa.me/254788922222');
    expect(findLink('I need setup and training').href).toContain('staff%20training');
    expect(findLink('Read the closing guide').href).toContain('/docs#cashier-sessions');
  });

  it('updates the closing summary and labels an overage without assigning a cause', async () => {
    const fixture = await render();
    enter(fixture, 'cash-up-cashSales', '2000');
    continueTo(fixture, 2);
    enter(fixture, 'cash-up-openingCash', '1000');
    continueTo(fixture, 3);
    enter(fixture, 'cash-up-actualClosingCash', '3100');
    button(fixture, 'See closing result').click();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('KES 3,000');
    expect(text).toContain('+KES 100');
    expect(text).toContain('A difference needs review');
    expect(text).toContain('Over');
  });

  it('does not treat an unchecked channel as a zero balance', async () => {
    const fixture = await render();
    enter(fixture, 'cash-up-cashSales', '2000');
    continueTo(fixture, 2);
    enter(fixture, 'cash-up-openingCash', '1000');
    continueTo(fixture, 3);
    enter(fixture, 'cash-up-actualMpesaReceipts', '0');
    button(fixture, 'See closing result').click();
    fixture.detectChanges();

    const cashSection = fixture.nativeElement.querySelector(
      '[aria-labelledby="cash-result-heading"]'
    ) as HTMLElement;
    expect(cashSection.textContent).toContain('Not checked');
    expect(cashSection.textContent).not.toContain('-KES 3,000');
  });

  it('shows an accessible validation error and recovers after reset', async () => {
    const fixture = await render();
    enter(fixture, 'cash-up-cashSales', '-50');

    const input = fixture.nativeElement.querySelector('#cash-up-cashSales') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('positive amount');

    button(fixture, 'Clear').click();
    fixture.detectChanges();
    expect(input.value).toBe('');
  });

  it('prints a valid entered summary', async () => {
    const fixture = await render();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    continueTo(fixture, 2);
    continueTo(fixture, 3);
    enter(fixture, 'cash-up-actualClosingCash', '0');
    button(fixture, 'See closing result').click();
    fixture.detectChanges();

    button(fixture, 'Print').click();
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

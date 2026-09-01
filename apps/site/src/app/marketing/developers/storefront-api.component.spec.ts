import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { StorefrontApiComponent } from './storefront-api.component';

describe('StorefrontApiComponent', () => {
  it('publishes a focused read-only quick start and contract links', async () => {
    await TestBed.configureTestingModule({
      imports: [StorefrontApiComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(StorefrontApiComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];

    expect(text).toContain('No API key or SDK is required.');
    expect(text).toContain('Carts, orders, checkout, online payments, webhooks');
    expect(text).toContain('https://store.dukarun.com/api/v1/storefronts/your-shop');
    expect(links.some(link => link.getAttribute('href') === '/openapi/storefront-v1.yaml')).toBe(
      true
    );
    expect(
      links.some(link => link.getAttribute('href') === '/developers/storefront/reference/')
    ).toBe(true);
    expect(
      ['quick-start', 'endpoints', 'browser-example', 'rules'].every(fragment =>
        links.some(
          link =>
            link.getAttribute('href') === `/developers/storefront#${fragment}` &&
            link.textContent?.trim().length
        )
      )
    ).toBe(true);
  });
});

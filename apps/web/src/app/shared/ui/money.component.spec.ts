import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MoneyComponent } from './money.component';

describe('MoneyComponent', () => {
  it('preserves buying-rate decimals visibly and for assistive technology only when requested', () => {
    const fixture = TestBed.createComponent(MoneyComponent);
    fixture.componentRef.setInput('amount', 2.5);
    fixture.componentRef.setInput('unitCost', true);
    fixture.detectChanges();
    const amount = fixture.nativeElement.querySelector('span') as HTMLElement;
    expect(amount.textContent?.trim()).toBe('2.5');
    expect(amount.getAttribute('aria-label')).toBe('KES 2.5');
    fixture.componentRef.setInput('showCurrency', true);
    fixture.detectChanges();
    expect(amount.textContent?.trim()).toBe('KES 2.5');
    fixture.componentRef.setInput('unitCost', false);
    fixture.detectChanges();
    expect(amount.textContent?.trim()).toBe('KES 3');
    expect(amount.getAttribute('aria-label')).toBe('KES 3');
  });
});

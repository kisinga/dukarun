import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MoneyComponent } from './money.component';

describe('MoneyComponent', () => {
  it('renders the amount and an accessible currency label', async () => {
    await TestBed.configureTestingModule({ imports: [MoneyComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MoneyComponent);
    fixture.componentRef.setInput('amount', 2450);
    fixture.detectChanges();

    const value = fixture.nativeElement.querySelector('span') as HTMLElement;
    expect(value.textContent?.trim()).toBe('2,450');
    expect(value.getAttribute('aria-label')).toBe('KES 2,450');
  });
});

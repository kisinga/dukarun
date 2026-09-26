import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DemandConfidenceIndicatorComponent } from './demand-confidence-indicator.component';

describe('DemandConfidenceIndicatorComponent', () => {
  it('uses progressively stronger bars without relying on color alone', () => {
    const fixture = TestBed.createComponent(DemandConfidenceIndicatorComponent);
    fixture.componentRef.setInput('value', 'low');
    fixture.detectChanges();

    const indicator = fixture.nativeElement.querySelector('[data-confidence]') as HTMLElement;
    const bars = [...indicator.querySelectorAll('[aria-hidden] span')] as HTMLElement[];
    expect(indicator.textContent?.trim()).toBe('Low');
    expect(indicator.getAttribute('aria-label')).toBe('Low demand confidence');
    expect(indicator.classList.contains('bg-warning/5')).toBe(true);
    expect(bars.filter(bar => !bar.classList.contains('opacity-20'))).toHaveLength(1);

    fixture.componentRef.setInput('value', 'high');
    fixture.detectChanges();
    expect(indicator.textContent?.trim()).toBe('High');
    expect(indicator.classList.contains('bg-success/20')).toBe(true);
    expect(bars.filter(bar => !bar.classList.contains('opacity-20'))).toHaveLength(3);
  });
});

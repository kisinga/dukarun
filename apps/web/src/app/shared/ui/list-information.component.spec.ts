import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ListSearchBarComponent } from './list-search-bar.component';
import { StatBarComponent } from './stat-bar.component';
import { DemandConfidenceIndicatorComponent } from './demand-confidence-indicator.component';

describe('List information controls', () => {
  it('uses supplied chips for both filter counts and clearing, including an empty authoritative list', () => {
    const fixture = TestBed.createComponent(ListSearchBarComponent);
    fixture.componentRef.setInput('filtersEnabled', true);
    fixture.componentRef.setInput('activeFilterCount', 9);
    fixture.componentRef.setInput('activeFilters', [{ key: 'status', label: 'Status: unpaid' }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.indicator-item')!.textContent?.trim()).toBe('1');
    const cleared = vi.fn();
    fixture.componentInstance.clearFilters.subscribe(cleared);
    [...root.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Clear filters')!
      .click();
    expect(cleared).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('activeFilters', []);
    fixture.detectChanges();
    expect(root.querySelector('.indicator-item')).toBeNull();
    expect(root.textContent).not.toContain('Clear filters');
  });

  it('retains count-based callers and exposes every metric regardless of emphasis', () => {
    const toolbar = TestBed.createComponent(ListSearchBarComponent);
    toolbar.componentRef.setInput('filtersEnabled', true);
    toolbar.componentRef.setInput('activeFilterCount', 2);
    toolbar.detectChanges();
    expect(toolbar.nativeElement.querySelector('.indicator-item').textContent.trim()).toBe('2');
    const stats = TestBed.createComponent(StatBarComponent);
    stats.componentRef.setInput('stats', [
      { label: 'Sales', value: 3, emphasis: 'primary' },
      { label: 'Margin', value: 40, emphasis: 'supporting', mobilePriority: 'primary' },
      { label: 'Refunds', value: 0, tone: 'warning', mobilePriority: 'secondary' },
    ]);
    stats.detectChanges();
    expect(stats.nativeElement.querySelectorAll('.stat-bar-item')).toHaveLength(3);
    expect(stats.nativeElement.querySelectorAll('.stat-bar-primary')).toHaveLength(1);
    expect(stats.nativeElement.querySelectorAll('.text-warning')).toHaveLength(0);
  });

  it('provides confidence interpretation through a native keyboard disclosure', () => {
    const fixture = TestBed.createComponent(DemandConfidenceIndicatorComponent);
    fixture.componentRef.setInput('value', 'low');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const details = root.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(root.querySelector('summary')!.getAttribute('aria-label')).toBe(
      'Explain Low demand confidence'
    );
    root.querySelector('summary')!.click();
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('conservatively capped');
  });
});

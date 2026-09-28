import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatBarComponent } from './stat-bar.component';

describe('StatBarComponent', () => {
  let fixture: ComponentFixture<StatBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatBarComponent] }).compileComponents();
    fixture = TestBed.createComponent(StatBarComponent);
    fixture.componentRef.setInput('stats', [
      { label: 'Active', value: 3 },
      { label: 'Owed', value: 'KES 0' },
      { label: 'Needs review', value: 1, filter: 'review' },
      { label: 'Archived', value: 0, mobilePriority: 'secondary' },
    ]);
    fixture.detectChanges();
  });

  it('keeps every supplied metric visible without a summary disclosure', () => {
    const root = fixture.nativeElement as HTMLElement;
    const metrics = [...root.querySelectorAll<HTMLElement>('.stat-bar-item')];
    expect(metrics).toHaveLength(4);
    for (const metric of metrics) {
      expect(getComputedStyle(metric).display).not.toBe('none');
      expect(metric.hidden).toBe(false);
    }
    expect(root.textContent).not.toContain('More summary');
    expect(metrics[3].textContent).toContain('Archived');
  });

  it('emits the selected metric filter with an accessible toggle state', () => {
    const selected = vi.fn();
    fixture.componentInstance.select.subscribe(selected);
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    expect(selected).toHaveBeenCalledWith('review');
  });
});

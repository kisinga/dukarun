import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { HistoryDateRangeComponent } from './history-date-range.component';

function setup(from = '', to = '') {
  const fixture = TestBed.createComponent(HistoryDateRangeComponent);
  fixture.componentRef.setInput('from', from);
  fixture.componentRef.setInput('to', to);
  fixture.detectChanges();
  const changed = vi.fn();
  fixture.componentInstance.rangeChange.subscribe(changed);
  const root = fixture.nativeElement as HTMLElement;
  const mode = (value: string) => {
    const select = root.querySelector('select')!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const date = (index: number, value: string) => {
    const input = root.querySelectorAll('input')[index];
    input.value = value;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  return { fixture, root, changed, mode, date };
}

describe('HistoryDateRangeComponent', () => {
  it.each([
    ['2026-09-01', '', 'since'],
    ['', '2026-09-20', 'until'],
    ['', '', 'all'],
    ['2026-09-01', '2026-09-20', 'between'],
  ])(
    'restores the applied endpoints %s / %s as %s without emitting a new request',
    (from, to, expected) => {
      const { root, changed } = setup(from, to);
      expect(root.querySelector('select')!.value).toBe(expected);
      expect(changed).not.toHaveBeenCalled();
    }
  );

  it('holds incomplete and reversed drafts locally, emitting only a valid pair', () => {
    const { mode, date, changed, root } = setup();
    mode('between');
    date(0, '2026-09-20');
    expect(changed).not.toHaveBeenCalled();
    date(1, '2026-09-01');
    expect(changed).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Showing the last applied dates');
    date(1, '2026-09-27');
    expect(changed).toHaveBeenCalledExactlyOnceWith({ from: '2026-09-20', to: '2026-09-27' });
  });

  it('supports explicit one-ended modes and all time without a 12-month limit', () => {
    const { mode, date, changed } = setup();
    mode('since');
    date(0, '2020-01-01');
    expect(changed).toHaveBeenLastCalledWith({ from: '2020-01-01', to: '' });
    mode('until');
    date(0, '2026-09-27');
    expect(changed).toHaveBeenLastCalledWith({ from: '', to: '2026-09-27' });
    mode('all');
    expect(changed).toHaveBeenLastCalledWith({ from: '', to: '' });
  });

  it('resets to page defaults and follows externally restored dates', () => {
    const { fixture, root, changed } = setup('2020-01-01');
    fixture.componentRef.setInput('defaultFrom', '2026-09-01');
    fixture.componentRef.setInput('defaultTo', '2026-09-27');
    fixture.detectChanges();
    root.querySelector('button')!.click();
    expect(changed).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-27' });
    fixture.componentRef.setInput('from', '');
    fixture.componentRef.setInput('to', '2026-08-31');
    fixture.detectChanges();
    expect(root.querySelector('select')!.value).toBe('until');
    expect(root.querySelector('input')!.value).toBe('2026-08-31');
  });
});

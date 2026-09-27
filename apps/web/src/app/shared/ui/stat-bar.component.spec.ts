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
      { label: 'Archived', value: 0 },
    ]);
    fixture.detectChanges();
  });

  it('exposes secondary metrics through the phone summary disclosure', () => {
    const root = fixture.nativeElement as HTMLElement;
    const disclosure = [...root.querySelectorAll('button')].find(button =>
      button.textContent?.includes('More summary')
    )!;
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    disclosure.click();
    fixture.detectChanges();
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure.textContent).toContain('Less summary');
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

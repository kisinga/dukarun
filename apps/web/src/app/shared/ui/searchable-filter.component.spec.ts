import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SearchableFilterComponent } from './searchable-filter.component';

describe('SearchableFilterComponent keyboard return', () => {
  let fixture: ComponentFixture<SearchableFilterComponent>;
  let root: HTMLElement;
  let trigger: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchableFilterComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SearchableFilterComponent);
    fixture.componentRef.setInput('options', [{ value: 'maker', label: 'Manufacturer' }]);
    fixture.detectChanges();
    root = fixture.nativeElement;
    trigger = root.querySelector('[role="combobox"]')!;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('returns focus after Escape from the search or an option', () => {
    for (const selector of ['input[type="search"]', '[role="listbox"] button']) {
      if (trigger.getAttribute('aria-expanded') !== 'true') {
        trigger.click();
        fixture.detectChanges();
      }
      const choice = root.querySelector<HTMLElement>(selector)!;
      choice.focus();
      choice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(root.querySelector('[role="listbox"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    }
  });

  it('returns focus after selecting a value without stealing an outside click', () => {
    const choices = root.querySelectorAll<HTMLButtonElement>('[role="listbox"] button');
    choices[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('maker');
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    fixture.detectChanges();
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      outside.focus();
      outside.click();
      fixture.detectChanges();
      expect(root.querySelector('[role="listbox"]')).toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});

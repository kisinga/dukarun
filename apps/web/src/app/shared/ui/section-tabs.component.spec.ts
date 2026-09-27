import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionTabsComponent } from './section-tabs.component';

describe('SectionTabsComponent', () => {
  let fixture: ComponentFixture<SectionTabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SectionTabsComponent] }).compileComponents();
    fixture = TestBed.createComponent(SectionTabsComponent);
    fixture.componentRef.setInput('items', [
      { value: 'priorities', label: 'Stock priorities' },
      { value: 'performance', label: 'Product performance' },
    ]);
    fixture.componentRef.setInput('value', 'priorities');
    fixture.componentRef.setInput('ariaLabel', 'Inventory analysis view');
    fixture.detectChanges();
  });

  it('renders one selected peer view and emits a new value', () => {
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLElement[];

    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].classList.contains('section-tab-active')).toBe(true);

    tabs[1].click();
    expect(changed).toHaveBeenCalledWith('performance');
  });

  it('can expose a labeled mobile selector for long tab sets', () => {
    fixture.componentRef.setInput('mobileSelect', true);
    fixture.componentRef.setInput('mobileLabel', 'Settings section');
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.getAttribute('aria-label')).toBe('Inventory analysis view');
    expect(fixture.nativeElement.textContent).toContain('Settings section');
  });

  it('can use the quiet primary-section treatment without changing tab behavior', () => {
    fixture.componentRef.setInput('presentation', 'primary');
    fixture.detectChanges();

    const tablist = fixture.nativeElement.querySelector('[role="tablist"]') as HTMLElement;
    const tabs = [...tablist.querySelectorAll('[role="tab"]')] as HTMLElement[];

    expect(tablist.classList.contains('border-b')).toBe(true);
    expect(tablist.classList.contains('section-tabs')).toBe(false);
    expect(tabs[0].classList.contains('nav-item-active')).toBe(true);
    expect(tabs[0].classList.contains('section-tab-active')).toBe(false);
  });
});

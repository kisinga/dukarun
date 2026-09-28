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

  it('provides a labeled mobile selector by default', () => {
    fixture.componentRef.setInput('mobileLabel', 'Settings section');
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.getAttribute('aria-label')).toBe('Settings section');
    expect(fixture.nativeElement.textContent).toContain('Settings section');
  });

  it('selects a non-first view on initial render', async () => {
    fixture = TestBed.createComponent(SectionTabsComponent);
    fixture.componentRef.setInput('items', [
      { value: 'priorities', label: 'Stock priorities' },
      { value: 'performance', label: 'Product performance' },
    ]);
    fixture.componentRef.setInput('value', 'performance');
    fixture.componentRef.setInput('ariaLabel', 'Inventory analysis view');
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).value).toBe(
      'performance'
    );
  });

  it('keeps the mobile selection in sync when items and the active view change', async () => {
    fixture.componentRef.setInput('value', 'performance');
    fixture.componentRef.setInput('items', [
      { value: 'overview', label: 'Overview' },
      { value: 'performance', label: 'Product performance' },
      { value: 'sources', label: 'Supplier performance', disabled: true },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('performance');
    expect(select.options[2].disabled).toBe(true);

    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    select.value = 'overview';
    select.dispatchEvent(new Event('change'));
    expect(changed).toHaveBeenCalledWith('overview');
    fixture.componentRef.setInput('value', 'overview');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.value).toBe('overview');
    expect(fixture.nativeElement.querySelector('[aria-selected="true"]').textContent).toContain(
      'Overview'
    );
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

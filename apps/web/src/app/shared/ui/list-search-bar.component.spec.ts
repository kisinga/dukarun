import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListSearchBarComponent } from './list-search-bar.component';

describe('ListSearchBarComponent', () => {
  let fixture: ComponentFixture<ListSearchBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ListSearchBarComponent] }).compileComponents();
    fixture = TestBed.createComponent(ListSearchBarComponent);
    fixture.componentRef.setInput('sortOptions', [{ value: 'name', label: 'Name' }]);
    fixture.componentRef.setInput('sortKey', 'name');
    fixture.detectChanges();
  });

  it('keeps the custom search name and emits sorting changes', () => {
    fixture.componentRef.setInput('searchLabel', 'Search customers');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('input')?.getAttribute('aria-label')).toBe('Search customers');
    const direction = root.querySelector('.sort-direction') as HTMLButtonElement;
    direction.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.sortDirection()).toBe('desc');
    expect(direction.getAttribute('aria-label')).toContain('Descending');
  });
});

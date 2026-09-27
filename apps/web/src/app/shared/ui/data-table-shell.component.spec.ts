import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DataTableShellComponent } from './data-table-shell.component';

describe('DataTableShellComponent', () => {
  it('makes primary table overflow keyboard accessible with sticky headers by default', async () => {
    await TestBed.configureTestingModule({
      imports: [DataTableShellComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(DataTableShellComponent);
    fixture.componentRef.setInput('heading', 'Sales history');
    fixture.detectChanges();

    const viewport = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.data-table-viewport'
    );
    expect(viewport).not.toBeNull();
    expect(viewport?.classList.contains('data-table-viewport-bounded')).toBe(true);
    expect(viewport?.getAttribute('role')).toBe('region');
    expect(viewport?.getAttribute('aria-label')).toBe('Sales history table');
    expect(viewport?.tabIndex).toBe(0);
  });

  it('allows short document-flow tables to opt out of the bounded region', async () => {
    await TestBed.configureTestingModule({
      imports: [DataTableShellComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(DataTableShellComponent);
    fixture.componentRef.setInput('stickyHeader', false);
    fixture.detectChanges();

    const viewport = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.data-table-viewport'
    );
    expect(viewport?.classList.contains('data-table-viewport-bounded')).toBe(false);
    expect(viewport?.hasAttribute('role')).toBe(false);
    expect(viewport?.hasAttribute('aria-label')).toBe(false);
    expect(viewport?.hasAttribute('tabindex')).toBe(false);
  });
});

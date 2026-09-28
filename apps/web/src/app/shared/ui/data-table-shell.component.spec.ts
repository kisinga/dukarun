import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  DataTableShellComponent,
  TableHeaderDirective,
  TableRowsDirective,
  type TableColumn,
} from './data-table-shell.component';

@Component({
  imports: [DataTableShellComponent, TableRowsDirective, TableHeaderDirective],
  template: `<app-data-table-shell
    heading="Products"
    [columns]="columns()"
    [stickyHeader]="sticky()"
  >
    <ng-template tableHeader="select"
      ><input type="checkbox" aria-label="Select all products" (change)="selected.set(!selected())"
    /></ng-template>
    <ng-template tableRows
      ><tr>
        <td>Selection</td>
        <td>Tea · Acme</td>
        @if (columns().length > 2) {
          <td>12</td>
        }
      </tr>
      <tr class="row-detail">
        <td [attr.colspan]="columns().length">
          Details
          <table>
            <thead>
              <tr>
                <th>Nested</th>
              </tr>
            </thead>
          </table>
        </td>
      </tr>
    </ng-template>
    <tfoot tableTotals>
      <tr>
        <td colspan="2">Total: 12</td>
      </tr>
    </tfoot>
    <span tableFooter>50 matching products</span>
  </app-data-table-shell>`,
})
class TableFixture {
  columns = signal<TableColumn[]>([
    { key: 'select', label: 'Selection', pinned: true },
    { key: 'product', label: 'Product', pinned: true },
  ]);
  sticky = signal(true);
  selected = signal(false);
}

describe('DataTableShellComponent', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  it('renders one operable header control and native accessible headers, keeping row detail and footer', async () => {
    await TestBed.configureTestingModule({ imports: [TableFixture] }).compileComponents();
    const fixture = TestBed.createComponent(TableFixture);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('input[type=checkbox]')).toHaveLength(1);
    const checkbox = element.querySelector('input')!;
    checkbox.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.selected()).toBe(true);
    expect(
      Array.from(element.querySelectorAll('.data-table-semantic-header th'), th =>
        th.textContent?.trim()
      )
    ).toEqual(['Selection', 'Product']);
    expect(element.querySelectorAll('.data-table-semantic-header th[scope=col]')).toHaveLength(2);
    expect(element.querySelector('.data-table-viewport')?.getAttribute('aria-label')).toBe(
      'Products table'
    );
    expect(element.querySelector('.data-table-viewport')?.getAttribute('tabindex')).toBe('0');
    expect(element.querySelector('.data-table-viewport table > tfoot')?.textContent).toContain(
      'Total: 12'
    );
    expect(element.querySelector('footer')?.textContent).toContain('50 matching products');
    expect(element.querySelector('.row-detail table th')?.textContent).toBe('Nested');
    expect(element.querySelectorAll('.data-table-header-band')).toHaveLength(1);
    fixture.destroy();
  });

  it('updates conditional columns and can opt out of sticky positioning without losing keyboard scrolling', async () => {
    await TestBed.configureTestingModule({ imports: [TableFixture] }).compileComponents();
    const fixture = TestBed.createComponent(TableFixture);
    fixture.detectChanges();
    fixture.componentInstance.columns.update(columns => [
      ...columns,
      { key: 'stock', label: 'Stock' },
    ]);
    fixture.componentInstance.sticky.set(false);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.data-table-header-band th')).toHaveLength(3);
    expect(element.querySelectorAll('.data-table-semantic-header th')).toHaveLength(3);
    expect(element.querySelector('.data-table-header-sticky')).toBeNull();
    expect(element.querySelector('.data-table-viewport')?.getAttribute('tabindex')).toBe('0');
    fixture.destroy();
  });
});

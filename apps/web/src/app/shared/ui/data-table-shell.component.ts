import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  Component,
  Directive,
  ElementRef,
  OnDestroy,
  TemplateRef,
  contentChild,
  contentChildren,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  minWidth?: string;
  /** Pin consecutive leading selection / identity columns on desktop. */
  pinned?: boolean;
}

@Directive({ selector: 'ng-template[tableRows]' })
export class TableRowsDirective {
  readonly template = inject(TemplateRef);
}

@Directive({ selector: 'ng-template[tableHeader]' })
export class TableHeaderDirective {
  readonly key = input.required<string>({ alias: 'tableHeader' });
  readonly template = inject(TemplateRef);
}

/** Semantic table plus a native-sticky visual header. Only horizontal scrolling is synchronized. */
@Component({
  selector: 'app-data-table-shell',
  imports: [NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    <section class="data-table-shell surface-card">
      @if (heading() || description()) {
        <header
          class="flex flex-col gap-2 border-b border-base-300/70 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div class="min-w-0">
            @if (heading()) {
              <h2 class="text-base font-semibold text-base-content">{{ heading() }}</h2>
            }
            @if (description()) {
              <p class="text-sm text-base-content/60">{{ description() }}</p>
            }
          </div>
          <div class="sm:ml-auto"><ng-content select="[tableActions]" /></div>
        </header>
      }
      <div
        class="data-table-records hidden lg:block print:block"
        [class.data-table-enhanced]="!!rows()"
        [style.--table-header-height]="headerHeight() + 'px'"
      >
        @if (rows()) {
          <div class="data-table-header-band" [class.data-table-header-sticky]="stickyHeader()">
            <div #headerViewport class="data-table-header-viewport" (scroll)="syncScroll('header')">
              <table
                role="presentation"
                class="table"
                [class]="tableClass()"
                [style.width.px]="tableWidth() || null"
                style="table-layout: fixed"
              >
                <colgroup>
                  @for (column of columns(); track column.key; let i = $index) {
                    <col [style.width.px]="widths()[i] || null" />
                  }
                </colgroup>
                <thead>
                  <tr [style.height.px]="headerHeight() || null">
                    @for (column of columns(); track column.key; let i = $index) {
                      <th
                        role="presentation"
                        [style.text-align]="column.align || 'left'"
                        [class.data-table-pinned]="column.pinned"
                        [style.left.px]="leftOffset(i)"
                      >
                        @if (customHeader(column.key); as header) {
                          <ng-container [ngTemplateOutlet]="header.template" />
                        } @else {
                          <span aria-hidden="true">{{ column.label }}</span>
                        }
                      </th>
                    }
                  </tr>
                </thead>
              </table>
            </div>
          </div>
        }
        <div
          #bodyViewport
          class="data-table-viewport"
          role="region"
          [attr.aria-label]="heading() ? heading() + ' table' : 'Scrollable data table'"
          tabindex="0"
          (scroll)="syncScroll('body')"
          (keydown)="panWithKeyboard($event)"
        >
          @if (rows(); as body) {
            <table #bodyTable class="table" [class]="tableClass()">
              <colgroup>
                @for (column of columns(); track column.key) {
                  <col [style.width]="column.width || null" />
                }
              </colgroup>
              <thead class="data-table-semantic-header">
                <tr [style.height.px]="headerHeight() || null">
                  @for (column of columns(); track column.key) {
                    <th
                      scope="col"
                      [style.text-align]="column.align || 'left'"
                      [style.min-width]="column.minWidth || null"
                    >
                      {{ column.label }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                <ng-container [ngTemplateOutlet]="body.template" />
              </tbody>
              <ng-content select="[tableTotals]" />
            </table>
          } @else {
            <ng-content />
          }
        </div>
      </div>
      <footer><ng-content select="[tableFooter]" /></footer>
    </section>
  `,
})
export class DataTableShellComponent implements AfterViewInit, OnDestroy {
  readonly heading = input<string>();
  readonly description = input<string>();
  readonly stickyHeader = input(true);
  readonly columns = input<readonly TableColumn[]>([]);
  readonly tableClass = input('table-sm');
  protected readonly rows = contentChild(TableRowsDirective);
  private readonly headers = contentChildren(TableHeaderDirective);
  private readonly bodyViewport = viewChild<ElementRef<HTMLElement>>('bodyViewport');
  private readonly headerViewport = viewChild<ElementRef<HTMLElement>>('headerViewport');
  private readonly bodyTable = viewChild<ElementRef<HTMLTableElement>>('bodyTable');
  protected readonly widths = signal<number[]>([]);
  protected readonly tableWidth = signal(0);
  protected readonly headerHeight = signal(0);
  private resizeObserver?: ResizeObserver;
  private contentObserver?: MutationObserver;
  private frame = 0;

  protected customHeader(key: string): TableHeaderDirective | undefined {
    return this.headers().find(header => header.key() === key);
  }

  protected leftOffset(index: number): number {
    return this.widths()
      .slice(0, index)
      .reduce((sum, width) => sum + width, 0);
  }

  ngAfterViewInit(): void {
    const table = this.bodyTable()?.nativeElement;
    if (!table) return;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
      this.resizeObserver.observe(table);
      this.resizeObserver.observe(this.bodyViewport()!.nativeElement);
    }
    this.contentObserver = new MutationObserver(() => this.scheduleMeasure());
    this.contentObserver.observe(table, { childList: true, subtree: true, characterData: true });
    this.scheduleMeasure();
  }

  private scheduleMeasure(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.measure());
  }

  private measure(): void {
    const table = this.bodyTable()?.nativeElement;
    const row = table?.tHead?.rows[0];
    if (!table || !row || !table.getBoundingClientRect().width) return;
    const widths = Array.from(row.cells, cell => cell.getBoundingClientRect().width);
    if (
      widths.some((width, i) => Math.abs(width - (this.widths()[i] ?? 0)) > 0.1) ||
      widths.length !== this.widths().length
    )
      this.widths.set(widths);
    this.tableWidth.set(table.getBoundingClientRect().width);
    const visual = this.headerViewport()?.nativeElement.querySelector('tr');
    // Measure natural heights too: a narrower font or wider viewport can shrink a wrapped label.
    row.style.height = '';
    if (visual) visual.style.height = '';
    const height = Math.max(
      row.getBoundingClientRect().height,
      visual?.getBoundingClientRect().height ?? 0
    );
    row.style.height = `${height}px`;
    if (visual) visual.style.height = `${height}px`;
    this.headerHeight.set(height);
    // Only direct body cells: expanded colspans and nested tables remain ordinary content.
    for (const bodyRow of Array.from(table.tBodies[0]?.rows ?? [])) {
      let columnIndex = 0;
      for (const cell of Array.from(bodyRow.cells)) {
        const pinned = cell.colSpan === 1 && !!this.columns()[columnIndex]?.pinned;
        cell.classList.toggle('data-table-pinned', pinned);
        cell.style.left = pinned ? `${this.leftOffset(columnIndex)}px` : '';
        columnIndex += cell.colSpan;
      }
    }
    this.syncScroll('body');
  }

  protected syncScroll(source: 'header' | 'body'): void {
    const body = this.bodyViewport()?.nativeElement;
    const header = this.headerViewport()?.nativeElement;
    if (!body || !header) return;
    const from = source === 'header' ? header : body;
    const to = source === 'header' ? body : header;
    if (Math.abs(to.scrollLeft - from.scrollLeft) > 0.5) to.scrollLeft = from.scrollLeft;
  }

  protected panWithKeyboard(event: KeyboardEvent): void {
    const viewport = this.bodyViewport()?.nativeElement;
    if (
      !viewport ||
      event.target !== viewport ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      viewport.scrollWidth <= viewport.clientWidth ||
      !['ArrowLeft', 'ArrowRight'].includes(event.key)
    )
      return;
    event.preventDefault();
    viewport.scrollLeft += event.key === 'ArrowRight' ? 80 : -80;
    this.syncScroll('body');
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.contentObserver?.disconnect();
    cancelAnimationFrame(this.frame);
  }
}

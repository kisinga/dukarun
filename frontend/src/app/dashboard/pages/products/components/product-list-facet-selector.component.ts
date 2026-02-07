import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FacetService } from '../../../../core/services/product/facet.service';
import type { FacetCode } from '../../../../core/services/product/facet.types';
import { FACET_DISPLAY_NAMES } from '../../../../core/services/product/facet.types';
import type { FacetValueSummary } from '../../../../core/services/product/facet.types';

/**
 * Facet selector for product list (and reusable on sell browse). Multi-select by ID.
 * Presentational: facetCode, selectedIds, (selectedIdsChange). No routing or global state.
 */
@Component({
  selector: 'app-product-list-facet-selector',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="dropdown" [class.dropdown-open]="isOpen()">
      <summary
        class="btn btn-sm btn-outline justify-between min-h-9 gap-2"
        [class.btn-active]="selectedIds().length > 0"
        (click)="toggle($event)"
        role="button"
      >
        <span class="truncate">{{ displayLabel() }}: {{ summaryText() }}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 shrink-0 transition-transform"
          [class.rotate-180]="isOpen()"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </summary>
      <ul
        class="dropdown-content menu z-[100] mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-2 shadow-xl"
      >
        @if (isLoading()) {
          <li class="px-3 py-3 text-sm text-base-content/60 flex items-center gap-2">
            <span class="loading loading-spinner loading-xs"></span>
            Loading options...
          </li>
        } @else if (options().length === 0) {
          <li class="px-3 py-3 text-sm text-base-content/60">No options available</li>
        } @else {
          @for (item of options(); track item.id) {
            <li>
              <label
                class="flex cursor-pointer gap-2 rounded-md px-3 py-2 hover:bg-base-200 active:bg-base-300"
              >
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm checkbox-primary"
                  [checked]="isSelected(item.id)"
                  (change)="toggleId(item.id)"
                />
                <span class="flex-1">{{ item.name }}</span>
              </label>
            </li>
          }
        }
      </ul>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class ProductListFacetSelectorComponent {
  private readonly facetService = inject(FacetService);
  private readonly elementRef = inject(ElementRef);

  readonly facetCode = input.required<FacetCode>();
  readonly selectedIds = input<string[]>([]);

  readonly selectedIdsChange = output<string[]>();

  readonly options = signal<FacetValueSummary[]>([]);
  readonly isLoading = signal(false);
  readonly isOpen = signal(false);

  private facetId: string | null = null;

  readonly labelInput = input<string>('');
  readonly displayLabel = computed(
    () => this.labelInput() || FACET_DISPLAY_NAMES[this.facetCode()],
  );

  summaryText(): string {
    const ids = this.selectedIds();
    if (ids.length === 0) return 'All';
    return `${ids.length} selected`;
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggle(event: Event): void {
    event.preventDefault();
    const open = !this.isOpen();
    this.isOpen.set(open);
    if (open && this.options().length === 0 && !this.facetId) {
      this.loadOptions();
    }
  }

  private async loadOptions(): Promise<void> {
    try {
      this.isLoading.set(true);
      const facet = await this.facetService.getFacetByCode(this.facetCode());
      this.facetId = facet.id;
      const items = await this.facetService.searchFacetValues(facet.id, '');
      this.options.set(items);
    } catch {
      this.options.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleId(id: string): void {
    const current = this.selectedIds();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    this.selectedIdsChange.emit(next);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.isOpen.set(false);
    }
  }
}

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
    <div class="form-control">
      <label class="label py-0">
        <span class="label-text text-sm font-medium text-base-content/70">{{ displayLabel() }}</span>
      </label>
      <details class="dropdown" [class.dropdown-open]="isOpen()">
        <summary
          class="btn btn-sm btn-outline justify-between min-h-9"
          (click)="toggle($event)"
          role="button"
        >
          <span class="truncate">{{ summaryText() }}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <ul
          class="dropdown-content menu z-10 mt-1 max-h-48 w-56 overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg"
        >
          @if (isLoading()) {
            <li class="px-2 py-2 text-sm text-base-content/60">
              <span class="loading loading-spinner loading-xs"></span>
              Loading...
            </li>
          } @else {
            @for (item of options(); track item.id) {
              <li>
                <label class="flex cursor-pointer gap-2 rounded px-2 py-1.5">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [checked]="isSelected(item.id)"
                    (change)="toggleId(item.id)"
                  />
                  <span>{{ item.name }}</span>
                </label>
              </li>
            }
            @if (options().length === 0 && !isLoading()) {
              <li class="px-2 py-2 text-sm text-base-content/60">No options</li>
            }
          }
        </ul>
      </details>
    </div>
  `,
})
export class ProductListFacetSelectorComponent {
  private readonly facetService = inject(FacetService);

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
    if (ids.length === 1) {
      const name = this.options().find((o) => o.id === ids[0])?.name ?? '1 selected';
      return name;
    }
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
}

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
import { FormsModule } from '@angular/forms';
import { FacetService } from '../../../../core/services/product/facet.service';
import type { FacetValueSummary } from '../../../../core/services/product/facet.types';

/**
 * Multi-facet selector: many values (e.g. tags).
 * Chips for selected; same search/create input to add.
 */
@Component({
  selector: 'app-multi-facet-selector',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-sm font-medium text-base-content/70">
        {{ label() }}
      </legend>
      @if (selected().length > 0) {
        <div class="flex flex-wrap gap-2 mb-2">
          @for (item of selected(); track item.id) {
            <span class="badge badge-lg badge-ghost gap-1">
              {{ item.name }}
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-circle"
                (click)="remove(item)"
                (mousedown)="$event.preventDefault()"
                aria-label="Remove {{ item.name }}"
              >
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </span>
          }
        </div>
      }
      <div class="relative">
        <div class="join w-full">
          <input
            type="text"
            class="input input-bordered join-item flex-1"
            [class.input-error]="hasError()"
            placeholder="{{ placeholder() }}"
            [value]="inputValue()"
            (input)="onInput($event)"
            (focus)="onFocus()"
            (blur)="onBlur()"
            (keydown)="onKeydown($event)"
            autocomplete="off"
            role="combobox"
            [attr.aria-expanded]="dropdownOpen()"
            [attr.aria-label]="label()"
          />
        </div>
        @if (dropdownOpen() && (suggestions().length > 0 || canCreate())) {
          <ul
            class="menu dropdown-content z-10 mt-1 w-full rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg max-h-48 overflow-y-auto"
            role="listbox"
          >
            @for (item of suggestions(); track item.id) {
              <li role="option">
                <button
                  type="button"
                  class="text-left"
                  (mousedown)="selectItem($event, item)"
                  [disabled]="isSelected(item)"
                >
                  {{ item.name }}
                  @if (isSelected(item)) {
                    <span class="badge badge-xs ml-1">added</span>
                  }
                </button>
              </li>
            }
            @if (canCreate()) {
              <li role="option">
                <button
                  type="button"
                  class="text-left text-primary font-medium"
                  (mousedown)="createAndSelect($event)"
                >
                  Add "{{ inputValue().trim() }}"
                </button>
              </li>
            }
          </ul>
        }
        @if (isSearching()) {
          <span
            class="absolute right-3 top-1/2 -translate-y-1/2 loading loading-spinner loading-xs"
          ></span>
        }
      </div>
      @if (errorMessage()) {
        <p class="label text-xs mt-1 text-error">{{ errorMessage() }}</p>
      }
    </fieldset>
  `,
})
export class MultiFacetSelectorComponent {
  private readonly facetService = inject(FacetService);

  readonly facetCode = input.required<string>();
  readonly selected = input<FacetValueSummary[]>([]);
  readonly label = input<string>('Tags');
  readonly placeholder = input<string>('Type to add...');

  readonly valueChange = output<FacetValueSummary[]>();

  readonly inputValue = signal('');
  readonly dropdownOpen = signal(false);
  readonly suggestions = signal<FacetValueSummary[]>([]);
  readonly isSearching = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private facetId: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  readonly hasError = computed(() => !!this.errorMessage());

  async onFocus(): Promise<void> {
    this.dropdownOpen.set(true);
    this.errorMessage.set(null);
    if (!this.facetId) {
      try {
        const facet = await this.facetService.getFacetByCode(
          this.facetCode() as 'manufacturer' | 'category' | 'tags',
        );
        this.facetId = facet.id;
        await this.runSearch();
      } catch (e) {
        this.errorMessage.set('Failed to load options');
      }
    } else {
      await this.runSearch();
    }
  }

  onBlur(): void {
    this.blurTimer = setTimeout(() => this.dropdownOpen.set(false), 150);
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.inputValue.set(value);
    this.errorMessage.set(null);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.runSearch(), 300);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.dropdownOpen.set(false);
    }
  }

  private async runSearch(): Promise<void> {
    if (!this.facetId) return;
    const term = this.inputValue().trim();
    this.isSearching.set(true);
    try {
      const items = await this.facetService.searchFacetValues(this.facetId, term);
      this.suggestions.set(items);
    } finally {
      this.isSearching.set(false);
    }
  }

  isSelected(item: FacetValueSummary): boolean {
    return this.selected().some((s) => s.id === item.id);
  }

  selectItem(event: Event, item: FacetValueSummary): void {
    event.preventDefault();
    if (this.isSelected(item)) return;
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
    this.inputValue.set('');
    this.suggestions.set([]);
    this.valueChange.emit([...this.selected(), item]);
  }

  remove(item: FacetValueSummary): void {
    this.valueChange.emit(this.selected().filter((s) => s.id !== item.id));
  }

  createAndSelect(event: Event): void {
    event.preventDefault();
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
    const term = this.inputValue().trim();
    if (!term) return;
    // Emit pending value (no API call); parent will create on form submit
    const pending: FacetValueSummary = { id: '', name: term, code: this.facetCode() };
    const already = this.selected().some(
      (s) => s.id === pending.id && s.name.toLowerCase() === pending.name.toLowerCase(),
    );
    if (!already) {
      this.valueChange.emit([...this.selected(), pending]);
    }
    this.inputValue.set('');
    this.suggestions.set([]);
  }

  canCreate(): boolean {
    const term = this.inputValue().trim();
    if (term.length < 2) return false;
    const exact = this.suggestions().find((s) => s.name.toLowerCase() === term.toLowerCase());
    return !exact;
  }
}

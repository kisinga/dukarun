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
import type { FacetCode, FacetValueSummary } from '../../../../core/services/product/facet.types';

/**
 * Single-facet selector: one value (e.g. manufacturer, category).
 * Autosearch on type; select from list or create new.
 */
@Component({
  selector: 'app-single-facet-selector',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-sm font-medium text-base-content/70">
        {{ label() }}
      </legend>
      <div class="relative">
        <div class="join w-full">
          <input
            type="text"
            class="input input-bordered join-item flex-1"
            [class.input-error]="hasError()"
            [placeholder]="selected() ? selected()!.name : placeholder()"
            [value]="inputValue()"
            (input)="onInput($event)"
            (focus)="onFocus()"
            (blur)="onBlur()"
            (keydown)="onKeydown($event)"
            autocomplete="off"
            role="combobox"
            [attr.aria-expanded]="dropdownOpen()"
            [attr.aria-haspopup]="'listbox'"
            [attr.aria-label]="label()"
          />
          @if (selected()) {
            <button
              type="button"
              class="btn btn-square btn-ghost join-item btn-sm"
              (click)="clear($event)"
              title="Clear"
              aria-label="Clear selection"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          }
        </div>
        @if (dropdownOpen() && (suggestions().length > 0 || canCreate())) {
          <ul
            class="menu dropdown-content z-10 mt-1 w-full rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg max-h-48 overflow-y-auto"
            role="listbox"
          >
            @for (item of suggestions(); track item.id) {
              <li role="option">
                <button type="button" class="text-left" (mousedown)="selectItem($event, item)">
                  {{ item.name }}
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
export class SingleFacetSelectorComponent {
  private readonly facetService = inject(FacetService);

  readonly facetCode = input.required<FacetCode>();
  readonly selected = input<FacetValueSummary | null>(null);
  readonly label = input<string>('');
  readonly placeholder = input<string>('Type to search...');

  readonly valueChange = output<FacetValueSummary | null>();

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
        const facet = await this.facetService.getFacetByCode(this.facetCode());
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

  selectItem(event: Event, item: FacetValueSummary): void {
    event.preventDefault();
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
    this.inputValue.set('');
    this.suggestions.set([]);
    this.dropdownOpen.set(false);
    this.valueChange.emit(item);
  }

  clear(event: Event): void {
    event.preventDefault();
    this.inputValue.set('');
    this.suggestions.set([]);
    this.valueChange.emit(null);
  }

  async createAndSelect(event: Event): Promise<void> {
    event.preventDefault();
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
    const term = this.inputValue().trim();
    if (!term || !this.facetId) return;
    this.isSearching.set(true);
    this.errorMessage.set(null);
    try {
      const created = await this.facetService.createFacetValue(this.facetId, term);
      this.inputValue.set('');
      this.suggestions.set([]);
      this.dropdownOpen.set(false);
      this.valueChange.emit(created);
    } catch (e) {
      this.errorMessage.set('Failed to create. It may already exist.');
    } finally {
      this.isSearching.set(false);
    }
  }

  canCreate(): boolean {
    const term = this.inputValue().trim();
    if (term.length < 2) return false;
    const exact = this.suggestions().find((s) => s.name.toLowerCase() === term.toLowerCase());
    return !exact;
  }
}

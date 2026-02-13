import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

/**
 * Presentational company search/select: search input, dropdown list, optional clear.
 * Used to select a company (customer company or supplier company). Parent owns data
 * and filtering; this component only renders and emits.
 */
@Component({
  selector: 'app-company-search-select',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative w-full"
      role="combobox"
      [attr.aria-expanded]="dropdownOpen()"
      aria-haspopup="listbox"
    >
      <div class="flex gap-1">
        <input
          type="text"
          class="input input-bordered input-sm sm:input-md flex-1 min-w-0"
          [placeholder]="placeholder()"
          [value]="displayValue()"
          (input)="onInput($any($event.target).value)"
          (focus)="dropdownOpen.set(true)"
          (blur)="onBlur()"
        />
        @if (selectedId()) {
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square shrink-0"
            (click)="clear.emit()"
            aria-label="Clear selected company"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      @if (dropdownOpen()) {
        <ul
          class="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-base-300 bg-base-100 shadow-lg py-1 list-none"
          role="listbox"
        >
          @for (item of items(); track item.id) {
            <li
              role="option"
              class="px-3 py-2 cursor-pointer hover:bg-base-200 text-sm"
              [class.bg-primary/10]="item.id === selectedId()"
              (mousedown)="onSelectItem(item)"
            >
              {{ getLabel()(item) }}
              @if (getSubtitle()?.(item)) {
                <span class="text-base-content/60"> · {{ getSubtitle()!(item) }}</span>
              }
            </li>
          }
          @if (items().length === 0) {
            <li class="px-3 py-2 text-base-content/50 text-sm">No companies match</li>
          }
        </ul>
      }
      @if (isLoading()) {
        <span
          class="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        >
          <span class="loading loading-spinner loading-sm"></span>
        </span>
      }
    </div>
  `,
})
export class CompanySearchSelectComponent<T extends { id: string }> {
  readonly items = input.required<T[]>();
  readonly selectedId = input<string | null>(null);
  readonly searchTerm = input.required<string>();
  readonly placeholder = input<string>('Search company...');
  readonly isLoading = input<boolean>(false);
  readonly getLabel = input.required<(item: T) => string>();
  readonly getSubtitle = input<(item: T) => string>();

  readonly searchTermChange = output<string>();
  readonly select = output<T>();
  readonly clear = output<void>();

  readonly dropdownOpen = signal(false);

  private blurTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly displayValue = computed(() => {
    const id = this.selectedId();
    const term = this.searchTerm();
    if (!id) return term;
    const list = this.items();
    const found = list.find((x) => x.id === id);
    if (!found) return term;
    return this.getLabel()(found);
  });

  onInput(value: string): void {
    this.searchTermChange.emit(value);
  }

  onSelectItem(item: T): void {
    this.dropdownOpen.set(false);
    this.select.emit(item);
  }

  onBlur(): void {
    this.blurTimeout = setTimeout(() => {
      this.dropdownOpen.set(false);
      this.blurTimeout = null;
    }, 150);
  }
}

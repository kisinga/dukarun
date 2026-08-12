import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

export interface SearchableFilterOption {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
}

/** Searchable choice/filter for entity lists that can reasonably grow beyond ten options. */
@Component({
  selector: 'app-searchable-filter',
  imports: [IconComponent],
  host: { class: 'relative block' },
  template: `
    <button
      type="button"
      class="input input-bordered flex w-full items-center gap-2 text-left font-normal"
      [class.input-sm]="controlSize() === 'sm'"
      [class.h-12]="controlSize() === 'md'"
      role="combobox"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel()"
      (click)="toggle()"
    >
      <span class="min-w-0 flex-1 truncate" [class.text-base-content/60]="!selected()">
        {{ selected()?.label ?? placeholder() }}
      </span>
      <app-icon name="heroChevronDown" class="shrink-0 text-base-content/50" />
    </button>

    @if (open()) {
      <button
        type="button"
        class="fixed inset-0 z-[75] bg-base-content/35 md:hidden"
        aria-label="Close choices"
        (click)="close()"
      ></button>
      <div
        class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[80] max-h-[70dvh] w-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-overlay md:absolute md:inset-x-auto md:top-full md:bottom-auto md:left-0 md:z-40 md:mt-1 md:max-h-none md:w-full"
        role="listbox"
      >
        <label class="input input-bordered flex min-h-11 items-center gap-2 input-sm">
          <app-icon name="heroMagnifyingGlass" class="shrink-0 text-base-content/50" />
          <input
            #searchInput
            class="min-w-0 grow"
            type="search"
            autocomplete="off"
            [placeholder]="searchPlaceholder()"
            [value]="query()"
            (input)="query.set(searchInput.value)"
            (keydown.escape)="close()"
          />
        </label>

        <div class="mt-2 max-h-[calc(70dvh-4.5rem)] overflow-y-auto md:max-h-64">
          <button
            type="button"
            class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-200"
            [class.bg-base-200]="value() === emptyValue()"
            (click)="choose(emptyValue())"
          >
            <app-icon name="heroBars3" class="shrink-0 text-base-content/50" />
            <span class="truncate">{{ placeholder() }}</span>
          </button>

          @for (option of visibleOptions(); track option.value) {
            <button
              type="button"
              class="flex min-h-11 w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-200"
              [class.bg-base-200]="value() === option.value"
              (click)="choose(option.value)"
            >
              <app-icon
                name="heroCheck"
                class="mt-0.5 shrink-0 text-base-content/50"
                [class.invisible]="value() !== option.value"
              />
              <span class="min-w-0">
                <span class="block truncate">{{ option.label }}</span>
                @if (option.description) {
                  <span class="block truncate text-xs text-base-content/60">{{
                    option.description
                  }}</span>
                }
              </span>
            </button>
          }

          @if (visibleOptions().length === 0) {
            <p class="px-3 py-4 text-center text-sm text-base-content/60">No matches found</p>
          } @else if (matchingCount() > maxResults()) {
            <p class="px-3 py-2 text-xs text-base-content/50">
              Keep typing to narrow {{ matchingCount() }} matches.
            </p>
          }
        </div>
      </div>
    }
  `,
})
export class SearchableFilterComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly options = input<readonly SearchableFilterOption[]>([]);
  readonly value = model('');
  readonly placeholder = input('All');
  readonly emptyValue = input('');
  readonly searchPlaceholder = input('Search…');
  readonly ariaLabel = input('Filter');
  readonly maxResults = input(10);
  readonly controlSize = input<'sm' | 'md'>('sm');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly selected = computed(() =>
    this.options().find(option => option.value === this.value())
  );
  private readonly matching = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    if (!query) return this.options();
    return this.options().filter(option =>
      `${option.label} ${option.description ?? ''} ${option.searchText ?? ''}`
        .toLocaleLowerCase()
        .includes(query)
    );
  });
  protected readonly matchingCount = computed(() => this.matching().length);
  protected readonly visibleOptions = computed(() => this.matching().slice(0, this.maxResults()));

  protected toggle(): void {
    this.query.set('');
    this.open.update(value => !value);
    if (this.open()) setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  protected choose(value: string): void {
    this.value.set(value);
    this.close();
  }

  protected close(): void {
    this.open.set(false);
    this.query.set('');
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}

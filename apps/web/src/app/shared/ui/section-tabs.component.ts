import { Component, input, output } from '@angular/core';

export interface SectionTabItem {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type SectionTabPresentation = 'primary' | 'segmented';

/**
 * In-page navigation between peer views of the same data or task.
 * Route-level workspace sections belong in RouteNavigationComponent instead.
 */
@Component({
  selector: 'app-section-tabs',
  host: { class: 'block' },
  template: `
    @if (items().length > 1) {
      @if (mobileSelect()) {
        <label class="form-control md:hidden">
          <span
            class="label-text mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60"
          >
            {{ mobileLabel() || ariaLabel() }}
          </span>
          <select
            class="select select-bordered min-h-11 w-full"
            [attr.aria-label]="ariaLabel()"
            [value]="value()"
            (change)="selectFromControl($event)"
          >
            @for (item of items(); track item.value) {
              <option [value]="item.value" [disabled]="item.disabled">{{ item.label }}</option>
            }
          </select>
        </label>
      }

      @if (presentation() === 'primary') {
        <div
          role="tablist"
          class="flex flex-wrap gap-1 border-b border-base-300 pb-2"
          [class.hidden]="mobileSelect()"
          [class.md:flex]="mobileSelect()"
          [attr.aria-label]="ariaLabel()"
        >
          @for (item of items(); track item.value) {
            <button
              role="tab"
              type="button"
              class="nav-item cursor-pointer border-0 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
              [class.nav-item-active]="value() === item.value"
              [attr.aria-selected]="value() === item.value"
              [attr.aria-disabled]="item.disabled || null"
              [disabled]="item.disabled"
              (click)="valueChange.emit(item.value)"
            >
              {{ item.label }}
            </button>
          }
        </div>
      } @else {
        <div
          role="tablist"
          class="section-tabs"
          [class.hidden]="mobileSelect()"
          [class.md:flex]="mobileSelect()"
          [attr.aria-label]="ariaLabel()"
        >
          @for (item of items(); track item.value) {
            <button
              role="tab"
              type="button"
              class="section-tab"
              [class.section-tab-active]="value() === item.value"
              [attr.aria-selected]="value() === item.value"
              [attr.aria-disabled]="item.disabled || null"
              [disabled]="item.disabled"
              (click)="valueChange.emit(item.value)"
            >
              {{ item.label }}
            </button>
          }
        </div>
      }
    }
  `,
})
export class SectionTabsComponent {
  readonly items = input.required<readonly SectionTabItem[]>();
  readonly value = input.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly mobileLabel = input('');
  readonly mobileSelect = input(false);
  readonly presentation = input<SectionTabPresentation>('segmented');
  readonly valueChange = output<string>();

  protected selectFromControl(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}

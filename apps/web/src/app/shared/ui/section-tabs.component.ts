import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SectionTabItem {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type SectionTabPresentation = 'primary' | 'segmented';

/**
 * In-page navigation between peer views of the same data or task.
 * Both desktop presentations become a native, labeled dropdown on phones.
 * Route-level workspace sections belong in RouteNavigationComponent instead.
 */
@Component({
  selector: 'app-section-tabs',
  imports: [FormsModule],
  host: { class: 'block min-w-0 max-w-full flex-1 md:flex-none' },
  template: `
    @if (items().length > 1) {
      <label class="flex min-w-0 flex-col md:hidden">
        <span
          class="label-text mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60"
        >
          {{ mobileLabel() || ariaLabel() }}
        </span>
        <select
          class="select select-bordered min-h-11 w-full min-w-0 max-w-full"
          [attr.aria-label]="mobileLabel() || ariaLabel()"
          [ngModel]="value()"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="valueChange.emit($event)"
        >
          @for (item of items(); track item.value) {
            <option [value]="item.value" [disabled]="item.disabled">{{ item.label }}</option>
          }
        </select>
      </label>

      @if (presentation() === 'primary') {
        <div
          role="tablist"
          class="hidden flex-wrap gap-1 border-b border-base-300 pb-2 md:flex"
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
        <div role="tablist" class="section-tabs hidden md:flex" [attr.aria-label]="ariaLabel()">
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
  readonly presentation = input<SectionTabPresentation>('segmented');
  readonly valueChange = output<string>();
}

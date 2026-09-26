import { Component, computed, input, output, signal } from '@angular/core';
import { IconComponent } from '../shared/ui/icon.component';
import { inclusiveDateRangeDays, type AppliedDateRange } from './date-range';
import type { DateRangePreset } from './insights.models';

@Component({
  selector: 'app-date-range-preset-control',
  imports: [IconComponent],
  template: `
    <section class="rounded-box border border-base-300 bg-base-200/30" aria-label="Analysis period">
      <div class="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div class="min-w-44 flex-1">
          <p class="text-xs font-semibold uppercase tracking-wide text-base-content/55">Period</p>
          <p class="mt-0.5 text-sm font-medium">{{ rangeLabel() }}</p>
        </div>

        <div
          class="flex min-h-11 rounded-field border border-base-300 bg-base-100 p-1"
          role="group"
          aria-label="Period presets"
        >
          @for (option of options; track option.value) {
            <button
              type="button"
              class="min-h-11 min-w-14 rounded-field px-3 text-sm font-medium transition-colors"
              [class.bg-primary]="value() === option.value"
              [class.text-primary-content]="value() === option.value"
              [class.text-base-content/70]="value() !== option.value"
              [attr.aria-pressed]="value() === option.value"
              (click)="selectPreset(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>

        @if (advanced()) {
          <button
            type="button"
            class="btn btn-ghost btn-sm min-h-11 gap-2"
            [attr.aria-expanded]="advancedOpen()"
            (click)="toggleAdvanced()"
          >
            <app-icon name="heroCalendarDays" />
            {{ value() === null ? 'Custom dates' : 'Advanced dates' }}
            <app-icon [name]="advancedOpen() ? 'heroChevronUp' : 'heroChevronDown'" size="sm" />
          </button>
        }
      </div>

      @if (advanced() && advancedOpen()) {
        <div class="border-t border-base-300 px-3 py-4 sm:px-4">
          <div class="grid items-end gap-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_auto]">
            <label class="form-control">
              <span class="label-text text-xs">From</span>
              <input
                type="date"
                class="input input-bordered min-h-11 w-full"
                [value]="draftFrom()"
                [max]="fromMax()"
                (input)="setDraftFrom($event)"
              />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">To</span>
              <input
                type="date"
                class="input input-bordered min-h-11 w-full"
                [value]="draftTo()"
                [min]="draftFrom()"
                [max]="maxDate()"
                (input)="setDraftTo($event)"
              />
            </label>
            <button
              type="button"
              class="btn btn-primary min-h-11"
              [disabled]="invalidReason() !== null || loading()"
              (click)="applyCustomRange()"
            >
              @if (loading()) {
                <span class="loading loading-spinner loading-xs"></span>
              }
              Apply dates
            </button>
          </div>
          <p
            class="mt-2 text-xs"
            [class.text-error]="invalidReason()"
            [class.text-base-content/55]="!invalidReason()"
          >
            {{ invalidReason() ?? advancedHint() }}
          </p>
        </div>
      }
    </section>
  `,
})
export class DateRangePresetControlComponent {
  readonly value = input.required<DateRangePreset | null>();
  readonly from = input('');
  readonly to = input('');
  readonly maxDate = input('');
  readonly advanced = input(false);
  readonly loading = input(false);
  readonly valueChange = output<DateRangePreset>();
  readonly rangeChange = output<AppliedDateRange>();

  protected readonly advancedOpen = signal(false);
  protected readonly draftFrom = signal('');
  protected readonly draftTo = signal('');
  protected readonly options: ReadonlyArray<{ value: DateRangePreset; label: string }> = [
    { value: 30, label: '1m' },
    { value: 180, label: '6m' },
    { value: 365, label: '12m' },
  ];
  protected readonly fromMax = computed(() => {
    const to = this.draftTo();
    const max = this.maxDate();
    if (!to) return max;
    return max && max < to ? max : to;
  });
  protected readonly invalidReason = computed(() => {
    const from = this.draftFrom();
    const to = this.draftTo();
    const max = this.maxDate();
    if (!from || !to) return 'Choose both dates.';
    if (from > to) return 'The start date must be before the end date.';
    if (max && (from > max || to > max)) {
      return `Dates cannot go beyond ${this.formatDate(max)}.`;
    }
    if (inclusiveDateRangeDays(from, to) > 365) return 'Choose a period of up to 12 months.';
    return null;
  });
  protected readonly rangeLabel = computed(() => {
    if (!this.from() || !this.to()) return 'Preparing business date…';
    return `${this.formatDate(this.from())} – ${this.formatDate(this.to())}`;
  });
  protected readonly advancedHint = computed(() => {
    const max = this.maxDate();
    return max
      ? `Choose up to 12 months, ending no later than ${this.formatDate(max)}.`
      : 'Choose a period of up to 12 months.';
  });

  protected selectPreset(value: DateRangePreset): void {
    this.advancedOpen.set(false);
    this.valueChange.emit(value);
  }

  protected toggleAdvanced(): void {
    this.advancedOpen.update(open => !open);
    if (this.advancedOpen()) {
      this.draftFrom.set(this.from());
      this.draftTo.set(this.to());
    }
  }

  protected setDraftFrom(event: Event): void {
    this.draftFrom.set((event.target as HTMLInputElement).value);
  }

  protected setDraftTo(event: Event): void {
    this.draftTo.set((event.target as HTMLInputElement).value);
  }

  protected applyCustomRange(): void {
    if (this.invalidReason()) return;
    this.rangeChange.emit({ from: this.draftFrom(), to: this.draftTo() });
    this.advancedOpen.set(false);
  }

  private formatDate(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat('en-KE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }
}

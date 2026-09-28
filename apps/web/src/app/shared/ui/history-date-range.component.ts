import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormFieldComponent } from './form-field.component';

export type HistoryDateMode = 'between' | 'since' | 'until' | 'all';
export interface HistoryDateRange {
  from: string;
  to: string;
}

/** Draft dates are local; only a valid applied range reaches the page and URL. */
@Component({
  selector: 'app-history-date-range',
  imports: [FormFieldComponent],
  host: { class: 'block min-w-0 w-full sm:w-auto' },
  template: `
    <div class="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap" [attr.aria-label]="label()">
      <app-form-field [label]="label()" class="col-span-2 min-w-0 sm:w-32">
        <select
          class="select select-bordered select-sm min-h-11 w-full"
          aria-label="Date mode"
          [value]="mode()"
          (change)="changeMode($event)"
        >
          <option value="between">Between</option>
          <option value="since">Since</option>
          <option value="until">Until</option>
          <option value="all">All time</option>
        </select>
      </app-form-field>
      @if (mode() === 'between' || mode() === 'since') {
        <app-form-field
          [label]="mode() === 'since' ? 'Since' : 'From'"
          class="min-w-0 sm:w-40"
          [class.col-span-2]="mode() === 'since'"
        >
          <input
            class="input input-bordered input-sm min-h-11 w-full max-w-full"
            type="date"
            [value]="draftFrom()"
            (change)="changeDate('from', $event)"
          />
        </app-form-field>
      }
      @if (mode() === 'between' || mode() === 'until') {
        <app-form-field
          [label]="mode() === 'until' ? 'Until' : 'To'"
          class="min-w-0 sm:w-40"
          [class.col-span-2]="mode() === 'until'"
        >
          <input
            class="input input-bordered input-sm min-h-11 w-full max-w-full"
            type="date"
            [value]="draftTo()"
            (change)="changeDate('to', $event)"
          />
        </app-form-field>
      }
      @if (canReset()) {
        <button
          type="button"
          class="btn btn-ghost btn-sm min-h-11 col-span-2 justify-self-start"
          (click)="resetDates()"
        >
          Reset dates
        </button>
      }
    </div>
    @if (invalidReason()) {
      <p class="mt-1 text-xs text-warning" role="status">
        {{ invalidReason() }} Showing the last applied dates.
      </p>
    }
  `,
})
export class HistoryDateRangeComponent {
  readonly from = input('');
  readonly to = input('');
  readonly defaultFrom = input('');
  readonly defaultTo = input('');
  readonly label = input('Dates');
  readonly rangeChange = output<HistoryDateRange>();
  protected readonly mode = signal<HistoryDateMode>('all');
  protected readonly draftFrom = signal('');
  protected readonly draftTo = signal('');
  protected readonly canReset = computed(
    () =>
      this.from() !== this.defaultFrom() || this.to() !== this.defaultTo() || !!this.invalidReason()
  );
  protected readonly invalidReason = computed(() => {
    const mode = this.mode();
    const from = this.draftFrom();
    const to = this.draftTo();
    if (mode === 'all') return null;
    if (mode !== 'until' && !this.validDate(from)) return 'Choose a valid start date.';
    if (mode !== 'since' && !this.validDate(to)) return 'Choose a valid end date.';
    if (mode === 'between' && from > to) return 'The start date must be on or before the end date.';
    return null;
  });

  constructor() {
    effect(() => this.setDraft(this.from(), this.to()));
  }

  protected changeMode(event: Event): void {
    this.mode.set((event.target as HTMLSelectElement).value as HistoryDateMode);
    this.apply();
  }

  protected changeDate(endpoint: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    (endpoint === 'from' ? this.draftFrom : this.draftTo).set(value);
    this.apply();
  }

  protected resetDates(): void {
    this.setDraft(this.defaultFrom(), this.defaultTo());
    this.apply();
  }

  private setDraft(from: string, to: string): void {
    this.draftFrom.set(from);
    this.draftTo.set(to);
    this.mode.set(from ? (to ? 'between' : 'since') : to ? 'until' : 'all');
  }

  private apply(): void {
    if (this.invalidReason()) return;
    this.rangeChange.emit({
      from: this.mode() === 'between' || this.mode() === 'since' ? this.draftFrom() : '',
      to: this.mode() === 'between' || this.mode() === 'until' ? this.draftTo() : '',
    });
  }

  private validDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
}

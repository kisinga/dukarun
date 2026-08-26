import { Component, input } from '@angular/core';

/** Standard full-row binary preference with one clear label and supporting copy. */
@Component({
  selector: 'app-preference-row',
  template: `
    <label
      class="flex min-h-12 cursor-pointer items-center justify-between gap-4 border-y border-base-300/60 py-2.5"
    >
      <span class="min-w-0">
        <span class="block text-sm font-medium">{{ label() }}</span>
        @if (description()) {
          <span class="type-caption mt-0.5 block">{{ description() }}</span>
        }
      </span>
      <span class="shrink-0"><ng-content /></span>
    </label>
  `,
})
export class PreferenceRowComponent {
  readonly label = input.required<string>();
  readonly description = input<string>();
}

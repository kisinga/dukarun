import { Component, input } from '@angular/core';

@Component({
  selector: 'app-data-table-shell',
  host: { class: 'block' },
  template: `
    <section
      class="data-table-shell overflow-hidden rounded-box border border-base-300/70 bg-base-100 shadow-card"
    >
      @if (title() || description()) {
        <header class="border-b border-base-300/70 px-5 py-4">
          @if (title()) {
            <h2 class="type-heading">{{ title() }}</h2>
          }
          @if (description()) {
            <p class="type-caption mt-0.5">{{ description() }}</p>
          }
        </header>
      }
      <div class="overflow-x-auto"><ng-content /></div>
    </section>
  `,
})
export class DataTableShellComponent {
  readonly title = input<string>();
  readonly description = input<string>();
}

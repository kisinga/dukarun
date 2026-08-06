import { Component, input } from '@angular/core';

/**
 * Shared surface for primary datasets. Keeps heading, table overflow and footer
 * visually consistent while allowing each page to own its semantic columns.
 */
@Component({
  selector: 'app-data-table-shell',
  host: { class: 'block' },
  template: `
    <section
      class="data-table-shell overflow-hidden rounded-box border border-base-300/70 bg-base-100"
    >
      @if (title() || description()) {
        <header
          class="flex flex-col gap-2 border-b border-base-300/70 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div class="min-w-0">
            @if (title()) {
              <h2 class="text-base font-semibold text-base-content">{{ title() }}</h2>
            }
            @if (description()) {
              <p class="text-sm text-base-content/60">{{ description() }}</p>
            }
          </div>
          <div class="sm:ml-auto"><ng-content select="[tableActions]" /></div>
        </header>
      }
      <div class="overflow-x-auto"><ng-content /></div>
      <footer><ng-content select="[tableFooter]" /></footer>
    </section>
  `,
})
export class DataTableShellComponent {
  readonly title = input<string>();
  readonly description = input<string>();
}

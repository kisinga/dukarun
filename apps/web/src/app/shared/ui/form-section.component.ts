import { Component, input } from '@angular/core';

/** One task section; the shared recipe flattens automatically when embedded in another card. */
@Component({
  selector: 'app-form-section',
  host: { class: 'block min-w-0' },
  template: `
    <section class="form-section">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 class="section-title">{{ title() }}</h3>
          @if (description()) {
            <p class="type-caption mt-0.5">{{ description() }}</p>
          }
        </div>
        <ng-content select="[sectionAction]" />
      </div>
      <ng-content />
    </section>
  `,
})
export class FormSectionComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}

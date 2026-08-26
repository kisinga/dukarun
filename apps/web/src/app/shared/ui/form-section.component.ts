import { Component, input } from '@angular/core';

/** Unframed grouping for fields that belong to one part of a task. */
@Component({
  selector: 'app-form-section',
  template: `
    <section class="border-t border-base-300/60 py-5">
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

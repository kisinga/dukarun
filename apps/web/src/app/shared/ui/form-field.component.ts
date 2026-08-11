import { Component, input } from '@angular/core';

/**
 * Form field (The Counter — one field recipe, labels never float beside controls).
 * Wraps a projected control with a caption label, optional hint, and error text.
 * Error wins over hint when both are present.
 */
@Component({
  selector: 'app-form-field',
  template: `
    <label class="form-field">
      <span [class]="desktopLabelHidden() ? 'form-field-label xl:sr-only' : 'form-field-label'">
        {{ label() }}
        @if (required()) {
          <span class="text-error">*</span>
        }
      </span>
      <ng-content></ng-content>
      @if (error(); as e) {
        <span class="form-field-error">{{ e }}</span>
      } @else if (hint(); as h) {
        <span class="form-field-hint">{{ h }}</span>
      }
    </label>
  `,
})
export class FormFieldComponent {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>();
  readonly required = input(false);
  /** Repeated desktop grids may provide one shared column header while retaining mobile labels. */
  readonly desktopLabelHidden = input(false);
}

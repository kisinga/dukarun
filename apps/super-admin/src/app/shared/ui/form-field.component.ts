import { Component, input } from '@angular/core';

@Component({
  selector: 'app-form-field',
  template: `
    <label class="form-field">
      <span class="form-field-label">
        {{ label() }}
        @if (required()) {
          <span class="text-error">*</span>
        }
      </span>
      <ng-content />
      @if (error(); as message) {
        <span class="form-field-error">{{ message }}</span>
      } @else if (hint(); as message) {
        <span class="form-field-hint">{{ message }}</span>
      }
    </label>
  `,
})
export class FormFieldComponent {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>();
  readonly required = input(false);
}

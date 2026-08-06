import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Validation Issues Panel Component
 *
 * Displays validation errors in a clear, actionable format.
 * Only shows when there are issues to fix.
 */
@Component({
  selector: 'app-validation-issues-panel',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (issues().length > 0) {
      <div class="card bg-error/10 border border-error/20">
        <div class="card-body p-3">
          <h3 class="font-bold text-sm text-error">Issues to fix:</h3>
          <ul class="text-xs text-error/80 mt-1">
            @for (issue of issues(); track issue) {
              <li>• {{ issue }}</li>
            }
          </ul>
        </div>
      </div>
    }
  `,
})
export class ValidationIssuesPanelComponent {
  // Inputs
  readonly issues = input.required<string[]>();
}

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Location Display Component
 *
 * Shows the selected stock location for products.
 * Simple display component with no interaction.
 */
@Component({
  selector: 'app-location-display',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-200">
      <div class="card-body p-3">
        <h3 class="font-bold text-sm">Location</h3>
        <p class="text-xs opacity-60">
          Products will be added to:
          <strong>{{ location()?.name || 'No location selected' }}</strong>
        </p>
      </div>
    </div>
  `,
})
export class LocationDisplayComponent {
  // Inputs
  readonly location = input<{ id: string; name: string } | null>(null);
}

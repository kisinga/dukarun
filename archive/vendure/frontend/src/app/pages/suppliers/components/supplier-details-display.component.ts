import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-supplier-details-display',
  imports: [],
  template: `
    <div class="flex-1">
      @if (code() && code() !== 'N/A') {
        <div class="text-sm">
          <span class="badge badge-sm badge-outline mr-1">{{ code() }}</span>
          <span class="text-base-content/80">{{ type() }}</span>
        </div>
      } @else {
        <div class="text-sm text-base-content/80">{{ type() }}</div>
      }
      <div class="text-xs text-base-content/60 mt-0.5">
        {{ addressCount() }} address{{ addressCount() !== 1 ? 'es' : '' }}
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierDetailsDisplayComponent {
  code = input<string>('');
  type = input<string>('General');
  addressCount = input<number>(0);
}

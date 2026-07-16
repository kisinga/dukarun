import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type BadgeType = 'success' | 'info' | 'warning' | 'error' | 'neutral';
type BadgeSize = 'xs' | 'sm' | 'md';

@Component({
  selector: 'app-status-badge',
  imports: [],
  template: `
    <div [class]="badgeClasses()">
      @if (showIcon()) {
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clip-rule="evenodd"
          ></path>
        </svg>
      }
      {{ label() }}
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  type = input<BadgeType>('neutral');
  label = input.required<string>();
  showIcon = input<boolean>(false);
  size = input<BadgeSize>('sm');

  badgeClasses = computed(() => {
    const type = this.type();
    const size = this.size();
    const typeClass = `badge-${type}`;
    const sizeClass = `badge-${size}`;
    const gapClass = this.showIcon() ? 'gap-1' : '';
    return `badge ${typeClass} ${sizeClass} ${gapClass}`;
  });
}

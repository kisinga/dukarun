import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

type BadgeType = 'success' | 'info' | 'warning' | 'error' | 'neutral';
type BadgeSize = 'xs' | 'sm' | 'md';

@Component({
  selector: 'app-status-badge',
  imports: [NgIcon],
  template: `
    <div [class]="badgeClasses()">
      @if (showIcon()) {
        <ng-icon name="heroCheck" size="0.875rem" />
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

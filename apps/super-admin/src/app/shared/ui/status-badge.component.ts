import { Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

export type BadgeType = 'success' | 'info' | 'warning' | 'error' | 'neutral';
type BadgeSize = 'xs' | 'sm' | 'md';

/**
 * Semantic status chip (ported from the old app). Use the ORDER_STATUS_MAP /
 * APPROVAL_STATUS_MAP helpers instead of ad-hoc badge classes.
 */
@Component({
  selector: 'app-status-badge',
  imports: [NgIcon],
  template: `
    <div [class]="badgeClasses()">
      @if (showIcon()) {
        <ng-icon name="heroCheckCircle" size="0.875rem" />
      }
      {{ label() }}
    </div>
  `,
})
export class StatusBadgeComponent {
  readonly type = input<BadgeType>('neutral');
  readonly label = input.required<string>();
  readonly showIcon = input<boolean>(false);
  readonly size = input<BadgeSize>('sm');

  protected readonly badgeClasses = computed(() => {
    const typeClass = `badge-${this.type()}`;
    const sizeClass = `badge-${this.size()}`;
    const gapClass = this.showIcon() ? 'gap-1' : '';
    return `badge ${typeClass} ${sizeClass} ${gapClass}`;
  });
}

/** Fixed semantic map for order statuses (The Counter — money meaning only). */
export const ORDER_STATUS_MAP: Record<string, BadgeType> = {
  completed: 'success',
  voided: 'error',
  draft: 'neutral',
  pending_payment: 'warning',
};

/** Fixed semantic map for approval decision statuses. */
export const APPROVAL_STATUS_MAP: Record<string, BadgeType> = {
  pending: 'warning',
  approved: 'success',
  denied: 'error',
};

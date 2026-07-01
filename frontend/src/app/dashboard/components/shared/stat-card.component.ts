import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatCardColor =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

const CARD_CLASSES: Record<StatCardColor, string> = {
  primary: 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20',
  secondary: 'bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/20',
  accent: 'bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20',
  neutral: 'bg-gradient-to-br from-neutral/10 to-neutral/5 border-neutral/20',
  info: 'bg-gradient-to-br from-info/10 to-info/5 border-info/20',
  success: 'bg-gradient-to-br from-success/10 to-success/5 border-success/20',
  warning: 'bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20',
  error: 'bg-gradient-to-br from-error/10 to-error/5 border-error/20',
};

const ICON_CONTAINER_CLASSES: Record<StatCardColor, string> = {
  primary: 'bg-primary/10',
  secondary: 'bg-secondary/10',
  accent: 'bg-accent/10',
  neutral: 'bg-neutral/10',
  info: 'bg-info/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  error: 'bg-error/10',
};

const VALUE_CLASSES: Record<StatCardColor, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  accent: 'text-accent',
  neutral: 'text-neutral',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
};

/**
 * Compact gradient stat card component
 *
 * A beautiful, space-efficient stat card with gradient background.
 * Used across all dashboard pages for consistent visual language.
 */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card border transition-all duration-200 hover:shadow-md" [class]="getCardClasses()">
      <div class="card-body p-3 lg:p-4">
        <div class="flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            [class]="getIconContainerClasses()"
          >
            <ng-content select="[icon]"></ng-content>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-base-content/60 truncate">{{ label() }}</p>
            <p class="text-xl lg:text-2xl font-bold tracking-tight" [class]="getValueClasses()">
              {{ value() }}
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly color = input<StatCardColor>('primary');

  getCardClasses(): string {
    return CARD_CLASSES[this.color()];
  }

  getIconContainerClasses(): string {
    return ICON_CONTAINER_CLASSES[this.color()];
  }

  getValueClasses(): string {
    return VALUE_CLASSES[this.color()];
  }
}

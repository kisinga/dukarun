import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

/**
 * Single notification item component.
 * Displays a notification with icon, title, message, and timestamp.
 */
@Component({
  selector: 'app-notification-item',
  template: `
    <div
      class="flex items-start gap-3 p-4 hover:bg-base-200 active:bg-base-300 cursor-pointer transition-colors"
      [class.bg-primary/5]="!notification().read"
      (click)="clicked.emit(notification().id)"
    >
      <!-- Type Icon -->
      <div
        class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg"
        [class.bg-warning/20]="typeClass() === 'warning'"
        [class.bg-success/20]="typeClass() === 'success'"
        [class.bg-info/20]="typeClass() === 'info'"
      >
        {{ icon() }}
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <p class="text-sm leading-tight" [class.font-semibold]="!notification().read">
          {{ notification().title }}
        </p>
        <p class="text-xs text-base-content/60 mt-1 line-clamp-2">
          {{ notification().message }}
        </p>
        <p class="text-xs text-base-content/40 mt-1.5">
          {{ formattedTime() }}
        </p>
      </div>

      <!-- Unread Indicator -->
      @if (!notification().read) {
        <div class="w-2.5 h-2.5 bg-primary rounded-full shrink-0 mt-1.5"></div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationItemComponent {
  /** The notification data to display */
  notification = input.required<NotificationData>();

  /** Emitted when the notification is clicked */
  clicked = output<string>();

  /** Get icon based on notification type */
  icon = () => {
    switch (this.notification().type) {
      case 'ORDER':
        return '💰';
      case 'STOCK':
        return '⚠️';
      case 'ML_TRAINING':
        return '🤖';
      case 'PAYMENT':
        return '💳';
      default:
        return 'ℹ️';
    }
  };

  /** Get CSS class for notification type */
  typeClass = () => {
    switch (this.notification().type) {
      case 'ORDER':
        return 'success';
      case 'STOCK':
        return 'warning';
      case 'ML_TRAINING':
        return 'info';
      case 'PAYMENT':
        return 'success';
      default:
        return 'info';
    }
  };

  /** Format the timestamp */
  formattedTime = () => {
    const now = new Date();
    const notificationTime = new Date(this.notification().createdAt);
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffInMinutes / 1440);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
  };
}


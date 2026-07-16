import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NotificationItemComponent, NotificationData } from './notification-item.component';

/**
 * Notification list component.
 * Displays a scrollable list of notifications with empty state.
 */
@Component({
  selector: 'app-notification-list',
  imports: [NotificationItemComponent],
  template: `
    <div class="flex-1 overflow-y-auto divide-y divide-base-200">
      @for (notif of notifications(); track notif.id) {
        <app-notification-item [notification]="notif" (clicked)="itemClicked.emit($event)" />
      } @empty {
        <!-- Empty State -->
        <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div class="w-20 h-20 rounded-full bg-base-200 flex items-center justify-center mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-10 w-10 text-base-content/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>
          <h3 class="font-semibold text-base mb-1">No notifications</h3>
          <p class="text-sm text-base-content/60">You're all caught up!</p>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationListComponent {
  /** List of notifications to display */
  notifications = input<NotificationData[]>([]);

  /** Emitted when a notification item is clicked */
  itemClicked = output<string>();
}


import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { NotificationItemComponent, NotificationData } from './notification-item.component';

/**
 * Notification list component.
 * Displays a scrollable list of notifications with empty state.
 */
@Component({
  selector: 'app-notification-list',
  imports: [NgIcon, NotificationItemComponent],
  template: `
    <div class="flex-1 overflow-y-auto divide-y divide-base-200">
      @for (notif of notifications(); track notif.id) {
        <app-notification-item [notification]="notif" (clicked)="itemClicked.emit($event)" />
      } @empty {
        <!-- Empty State -->
        <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div class="w-20 h-20 rounded-full bg-base-200 flex items-center justify-center mb-4">
            <ng-icon name="heroBell" size="2.5rem" class="text-base-content/30" />
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

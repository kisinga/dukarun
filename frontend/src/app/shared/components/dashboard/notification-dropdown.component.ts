import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NotificationData } from './notification-item.component';
import { NotificationListComponent } from './notification-list.component';

// Re-export for convenience
export type { NotificationData as NotificationItem } from './notification-item.component';

/**
 * Notification dropdown component.
 * Uses daisyUI details/summary pattern for proper open/close behavior.
 */
@Component({
  selector: 'app-notification-dropdown',
  imports: [NotificationListComponent],
  styleUrls: ['./notification-dropdown.component.scss'],
  template: `
    <details #detailsRef class="dropdown dropdown-end notification-dropdown-wrapper">
      <!-- Trigger Button -->
      <summary
        class="btn btn-ghost btn-square btn-md indicator list-none cursor-pointer"
        [class.animate-pulse]="unreadCount() > 0"
        aria-label="View notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        @if (unreadCount() > 0) {
          <span class="badge badge-error badge-sm indicator-item font-semibold">
            {{ unreadCount() > 99 ? '99+' : unreadCount() }}
          </span>
        }
      </summary>

      <!-- Dropdown Content -->
      <div
        class="dropdown-content notification-dropdown-content bg-base-100 rounded-xl z-50 mt-2 w-[calc(100vw-1rem)] sm:w-96 shadow-xl border border-base-300 flex flex-col max-h-[calc(100vh-6rem)]"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-100 sticky top-0 z-10 rounded-t-xl"
        >
          <div>
            <h3 class="font-bold text-base">Notifications</h3>
            @if (unreadCount() > 0) {
              <p class="text-xs text-base-content/60 mt-0.5">{{ unreadCount() }} unread</p>
            }
          </div>
          <div class="flex items-center gap-2">
            @if (unreadCount() > 0) {
              <button
                type="button"
                class="btn btn-ghost btn-xs sm:btn-sm"
                (click)="onMarkAllRead(); $event.stopPropagation()"
              >
                Mark all read
              </button>
            }
          </div>
        </div>

        <!-- Notification List -->
        <app-notification-list
          [notifications]="notifications()"
          (itemClicked)="onItemClicked($event)"
        />
      </div>
    </details>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationDropdownComponent {
  /** List of notifications to display */
  notifications = input<NotificationData[]>([]);

  /** Number of unread notifications */
  unreadCount = input<number>(0);

  /** Emitted when a notification is clicked to mark as read */
  markAsRead = output<string>();

  /** Emitted when "Mark all read" is clicked */
  markAllRead = output<void>();

  /** Reference to the details element */
  detailsRef = viewChild<ElementRef<HTMLDetailsElement>>('detailsRef');

  /** Handle notification item click */
  onItemClicked(notificationId: string): void {
    this.markAsRead.emit(notificationId);
    this.closeDropdown();
  }

  /** Handle mark all read */
  onMarkAllRead(): void {
    this.markAllRead.emit();
  }

  /** Close the dropdown */
  closeDropdown(): void {
    const details = this.detailsRef()?.nativeElement;
    if (details?.open) {
      details.open = false;
    }
  }

  /** Handle clicks outside to close dropdown */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const details = this.detailsRef()?.nativeElement;
    if (!details?.open) {
      return;
    }

    const target = event.target as Node;
    if (!details.contains(target)) {
      details.open = false;
    }
  }

  /** Handle escape key to close dropdown */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeDropdown();
  }
}

import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { AppNotification, NotificationsService } from './notifications.service';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';

const TYPE_ICON: Record<string, string> = {
  credit_reminder: 'heroBanknotes',
  subscription: 'heroCreditCard',
  approval: 'heroCheckBadge',
  stock: 'heroCube',
  system: 'heroArchiveBox',
};

@Component({
  selector: 'app-notifications',
  imports: [
    PageLayoutComponent,
    EmptyStateComponent,
    IconComponent,
    ButtonComponent,
    MobileListComponent,
    PageActionsComponent,
  ],
  template: `
    <app-page title="Notifications" [badge]="notifications.unreadCount()">
      @if (notifications.unreadCount() > 0) {
        <app-page-actions actions>
          <button utilityAction appButton variant="ghost" [disabled]="busy()" (click)="markAll()">
            Mark all read
          </button>
        </app-page-actions>
      }

      @if (error()) {
        <p class="mb-2 text-sm text-error">{{ error() }}</p>
      }

      @if (notifications.notifications().length === 0) {
        <app-empty-state
          icon="heroBellSlash"
          title="No notifications"
          description="Credit reminders, approvals, and stock alerts land here."
        />
      } @else {
        <app-mobile-list [desktopVisible]="true">
          @for (n of notifications.notifications(); track n.id) {
            <button
              mobileListRow
              class="w-full bg-base-100 text-left"
              [class.opacity-60]="n.read_at !== null"
              (click)="open(n)"
            >
              <div class="flex min-h-20 items-start gap-3 p-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  [class.bg-primary/10]="n.read_at === null"
                  [class.bg-base-200]="n.read_at !== null"
                >
                  <app-icon
                    [name]="iconFor(n.type)"
                    size="lg"
                    [class.text-primary]="n.read_at === null"
                    [class.text-base-content/40]="n.read_at !== null"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span
                      class="text-sm"
                      [class.font-semibold]="n.read_at === null"
                      [class.text-base-content/60]="n.read_at !== null"
                    >
                      {{ n.title }}
                    </span>
                    @if (n.read_at === null) {
                      <app-icon name="heroBellAlert" size="sm" class="text-primary" />
                    }
                    <span class="type-caption ml-auto shrink-0">{{ age(n.created_at) }}</span>
                  </div>
                  @if (n.body) {
                    <p class="mt-0.5 line-clamp-2 text-sm text-base-content/60">{{ n.body }}</p>
                  }
                  @if (n.link) {
                    <span
                      class="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                    >
                      {{ n.action_label || 'View details' }}
                      <app-icon name="heroChevronRight" size="sm" />
                    </span>
                  }
                </div>
              </div>
            </button>
          }
        </app-mobile-list>
      }
    </app-page>
  `,
})
export class NotificationsComponent {
  protected readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected iconFor(type: string): string {
    return TYPE_ICON[type] ?? 'heroArchiveBox';
  }

  protected age(iso: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  /** Tap = mark read; navigate when the notification carries a link. */
  protected async open(n: AppNotification): Promise<void> {
    try {
      if (n.link) {
        await this.notifications.recordClick(n.id);
        await this.router.navigateByUrl(n.link);
      } else if (n.read_at === null) {
        await this.notifications.markRead(n.id);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed');
    }
  }

  protected async markAll(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.notifications.markAllRead();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed');
    } finally {
      this.busy.set(false);
    }
  }
}

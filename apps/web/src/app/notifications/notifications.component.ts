import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { AppNotification, NotificationsService } from './notifications.service';

const TYPE_ICON: Record<string, string> = {
  credit_reminder: 'heroBanknotes',
  subscription: 'heroCreditCard',
  approval: 'heroCheckBadge',
  stock: 'heroCube',
  system: 'heroArchiveBox',
};

@Component({
  selector: 'app-notifications',
  imports: [NgIcon, PageHeaderComponent, EmptyStateComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="page">
        <app-page-header title="Notifications" backLink="/dashboard" backLabel="Dashboard">
          @if (notifications.unreadCount() > 0) {
            <button
              actions
              class="btn btn-ghost btn-sm min-h-11"
              [disabled]="busy()"
              (click)="markAll()"
            >
              Mark all read
            </button>
          }
        </app-page-header>

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
          <div class="flex flex-col gap-2">
            @for (n of notifications.notifications(); track n.id) {
              <button
                class="card w-full bg-base-100 text-left"
                [class.opacity-60]="n.read_at !== null"
                (click)="open(n)"
              >
                <div class="card-body flex-row items-start gap-3 p-4">
                  <div
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    [class.bg-primary/10]="n.read_at === null"
                    [class.bg-base-200]="n.read_at !== null"
                  >
                    <ng-icon
                      [name]="iconFor(n.type)"
                      class="text-xl"
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
                        <span class="h-2 w-2 shrink-0 rounded-full bg-primary"></span>
                      }
                      <span class="type-caption ml-auto shrink-0">{{ age(n.created_at) }}</span>
                    </div>
                    @if (n.body) {
                      <p class="mt-0.5 truncate text-sm text-base-content/60">{{ n.body }}</p>
                    }
                  </div>
                </div>
              </button>
            }
          </div>
        }
      </div>
    </main>
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
      if (n.read_at === null) await this.notifications.markRead(n.id);
      if (n.link) await this.router.navigate([n.link]);
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

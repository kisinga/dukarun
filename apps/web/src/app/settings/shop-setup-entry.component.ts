import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PermissionsService } from '../core/permissions.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { TaskDialogComponent } from '../shared/ui/task-dialog.component';
import { ShopSetupCoordinator } from './shop-setup-coordinator.service';

@Component({
  selector: 'app-shop-setup-entry',
  imports: [RouterLink, ButtonComponent, TaskDialogComponent],
  template: `
    @if (permissions.has('ManageCompanySettings')) {
      <section class="card bg-base-100">
        <div class="card-body flex-row flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 class="section-title">
              {{ setup.ready() ? 'Shop setup' : 'Get your shop ready' }}
            </h2>
            <p class="type-caption">
              {{
                setup.ready()
                  ? 'Review your shop details or continue your first business cycle.'
                  : 'Confirm your identity, choose a web address and preview your documents.'
              }}
            </p>
          </div>
          <a appButton variant="outline" routerLink="/shop-setup">{{
            setup.ready() ? 'Review setup' : 'Continue setup'
          }}</a>
        </div>
      </section>
      <app-task-dialog
        [(open)]="offerOpen"
        title="Get your shop ready"
        [error]="error()"
        (closed)="defer()"
      >
        <p>
          Three short steps: confirm your shop details, review its web address and see your first
          receipt. You can skip this and return from the dashboard or Business settings.
        </p>
        <div taskFooter class="flex flex-wrap justify-end gap-2">
          <button appButton variant="ghost" [disabled]="busy()" (click)="defer()">Later</button
          ><button appButton [loading]="busy()" (click)="start()">Set up shop</button>
        </div>
      </app-task-dialog>
    }
  `,
})
export class ShopSetupEntryComponent {
  readonly permissions = inject(PermissionsService);
  readonly setup = inject(ShopSetupCoordinator);
  private readonly router = inject(Router);
  readonly offerOpen = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  constructor() {
    effect(() => {
      if (this.permissions.has('ManageCompanySettings'))
        void this.setup.store.load().catch(() => undefined);
    });
    effect(() => {
      this.offerOpen.set(this.permissions.has('ManageCompanySettings') && this.setup.autoOffer());
    });
  }
  async start(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.setup.offered();
      this.offerOpen.set(false);
      await this.router.navigateByUrl('/shop-setup');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Setup could not be opened. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
  async defer(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.setup.offered(true);
      this.offerOpen.set(false);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Your choice could not be saved. Try again.');
      this.offerOpen.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}

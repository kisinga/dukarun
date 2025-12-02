import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminManagementComponent } from './components/admin-management.component';
import { AuditTrailComponent } from './components/audit-trail.component';
import { GeneralSettingsComponent } from './components/general-settings.component';
import { MlModelStatusComponent } from './components/ml-model-status.component';
import { NotificationSettingsComponent } from './components/notification-settings.component';
import { NotificationTestComponent } from './components/notification-test.component';
import { PaymentMethodsComponent } from './components/payment-methods.component';
import { SubscriptionStatusComponent } from './components/subscription-status.component';
import { SubscriptionTiersComponent } from './components/subscription-tiers.component';
import { TeamComponent } from '../team/team.component';

@Component({
  selector: 'app-settings',
  imports: [
    CommonModule,
    GeneralSettingsComponent,
    AdminManagementComponent,
    AuditTrailComponent,
    MlModelStatusComponent,
    NotificationSettingsComponent,
    NotificationTestComponent,
    PaymentMethodsComponent,
    SubscriptionStatusComponent,
    SubscriptionTiersComponent,
    TeamComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5 lg:space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl lg:text-3xl font-bold tracking-tight">Settings</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Manage your channel configuration and preferences
          </p>
        </div>
      </div>

      <!-- Tabs -->
      <div role="tablist" class="tabs tabs-box overflow-x-auto">
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="General"
          [checked]="activeTab() === 'general'"
          (change)="setActiveTab('general')"
        />
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="ML Model"
          [checked]="activeTab() === 'ml-model'"
          (change)="setActiveTab('ml-model')"
        />
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="Notifications"
          [checked]="activeTab() === 'notifications'"
          (change)="setActiveTab('notifications')"
        />
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="Test Notifications"
          [checked]="activeTab() === 'test-notifications'"
          (change)="setActiveTab('test-notifications')"
        />
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="Admins"
          [checked]="activeTab() === 'admins'"
          (change)="setActiveTab('admins')"
        />
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="Payments"
          [checked]="activeTab() === 'payments'"
          (change)="setActiveTab('payments')"
        />
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="Audit Trail"
          [checked]="activeTab() === 'audit-trail'"
          (change)="setActiveTab('audit-trail')"
        />
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="Subscription"
          [checked]="activeTab() === 'subscription'"
          (change)="setActiveTab('subscription')"
        />
        <input
          type="radio"
          name="settings_tabs"
          class="tab"
          aria-label="Team"
          [checked]="activeTab() === 'team'"
          (change)="setActiveTab('team')"
        />
      </div>

      <!-- Tab Content -->
      @switch (activeTab()) {
        @case ('general') {
          <app-general-settings />
        }
        @case ('ml-model') {
          <app-ml-model-status />
        }
        @case ('notifications') {
          <app-notification-settings />
        }
        @case ('test-notifications') {
          <app-notification-test />
        }
        @case ('admins') {
          <app-admin-management />
        }
        @case ('payments') {
          <app-payment-methods />
        }
        @case ('audit-trail') {
          <app-audit-trail />
        }
        @case ('subscription') {
          <div class="space-y-6">
            <app-subscription-status />
            <app-subscription-tiers />
          </div>
        }
        @case ('team') {
          <app-team />
        }
      }
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly activeTab = signal<
    | 'general'
    | 'ml-model'
    | 'notifications'
    | 'test-notifications'
    | 'admins'
    | 'payments'
    | 'audit-trail'
    | 'subscription'
    | 'team'
  >('general');

  ngOnInit() {
    // Read query parameters to set active tab
    this.route.queryParams.subscribe((params) => {
      if (params['tab']) {
        const tab = params['tab'] as string;
        if (
          [
            'general',
            'ml-model',
            'notifications',
            'test-notifications',
            'admins',
            'payments',
            'audit-trail',
            'subscription',
            'team',
          ].includes(tab)
        ) {
          this.activeTab.set(tab as any);
        }
      }
    });
  }

  setActiveTab(
    tab:
      | 'general'
      | 'ml-model'
      | 'notifications'
      | 'test-notifications'
      | 'admins'
      | 'payments'
      | 'audit-trail'
      | 'subscription'
      | 'team',
  ): void {
    this.activeTab.set(tab);
    // Update URL query params
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }
}

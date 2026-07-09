import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { DocumentNode } from 'graphql';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ApolloService } from '../../core/services/apollo.service';
import {
  PLATFORM_SETTINGS,
  REGISTRATION_SEED_CONTEXT,
  UPDATE_PLATFORM_SETTINGS,
  UPDATE_REGISTRATION_TAX_RATE,
  UPDATE_CUSTOMER_NOTIFICATIONS_ENABLED,
  SEND_TEST_WHATSAPP_NOTIFICATION,
  SEND_TEST_CUSTOMER_NOTIFICATION,
} from '../../core/graphql/operations.graphql';

interface ZoneMember {
  id: string;
  name: string;
  code: string;
}

interface RegistrationZone {
  id: string;
  name: string;
  members: ZoneMember[];
}

interface RegistrationTaxRate {
  id: string;
  name: string;
  categoryName: string;
  value: number;
}

interface RegistrationSeedContext {
  zone: RegistrationZone;
  taxRate: RegistrationTaxRate | null;
}

@Component({
  selector: 'app-platform-data',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  templateUrl: './platform-data.component.html',
  styleUrl: './platform-data.component.scss',
})
export class PlatformDataComponent implements OnInit {
  private readonly apollo = inject(ApolloService);

  context = signal<RegistrationSeedContext | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);
  taxPercentage = signal<number>(0);
  trialDays = signal<number>(30);
  savingTrialDays = signal(false);
  customerNotificationsEnabled = signal<boolean>(false);
  savingCustomerNotifications = signal(false);
  testPhoneNumber = signal<string>('');
  testMessage = signal<string>('');
  sendingTestWhatsApp = signal(false);
  testWhatsAppResult = signal<{ success: boolean; message: string } | null>(null);
  testChannelId = signal<string>('');
  testCustomerId = signal<string>('');
  testTriggerKey = signal<string>('balance_changed');
  sendingTestCustomerNotification = signal(false);
  testCustomerNotificationResult = signal<{ success: boolean; message: string } | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [ctxResult, settingsResult] = await Promise.all([
        this.apollo.getClient().query<{ registrationSeedContext: RegistrationSeedContext }>({
          query: REGISTRATION_SEED_CONTEXT,
          fetchPolicy: 'network-only',
        }),
        this.apollo.getClient().query<{
          platformSettings: { trialDays: number; customerNotificationsEnabled: boolean };
        }>({
          query: PLATFORM_SETTINGS as DocumentNode,
          fetchPolicy: 'network-only',
        }),
      ]);
      const ctx = ctxResult.data?.registrationSeedContext ?? null;
      this.context.set(ctx);
      if (ctx?.taxRate != null) {
        this.taxPercentage.set(ctx.taxRate.value);
      }
      const trialDays = settingsResult.data?.platformSettings?.trialDays;
      if (typeof trialDays === 'number' && trialDays >= 0) {
        this.trialDays.set(trialDays);
      }
      const customerNotificationsEnabled =
        settingsResult.data?.platformSettings?.customerNotificationsEnabled;
      if (typeof customerNotificationsEnabled === 'boolean') {
        this.customerNotificationsEnabled.set(customerNotificationsEnabled);
      }
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load platform data');
    } finally {
      this.loading.set(false);
    }
  }

  async updateTaxRate(): Promise<void> {
    const percentage = this.taxPercentage();
    if (percentage < 0 || percentage > 100) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_REGISTRATION_TAX_RATE,
        variables: { input: { percentage } },
      });
      await this.load();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to update tax rate');
    } finally {
      this.saving.set(false);
    }
  }

  async updateTrialDays(): Promise<void> {
    const days = Math.max(0, Math.floor(Number(this.trialDays())));
    this.trialDays.set(days);
    this.savingTrialDays.set(true);
    this.error.set(null);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_PLATFORM_SETTINGS as DocumentNode,
        variables: { trialDays: days },
      });
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to update trial duration');
    } finally {
      this.savingTrialDays.set(false);
    }
  }

  async updateCustomerNotificationsEnabled(): Promise<void> {
    const enabled = this.customerNotificationsEnabled();
    this.savingCustomerNotifications.set(true);
    this.error.set(null);
    try {
      await this.apollo.getClient().mutate({
        mutation: UPDATE_CUSTOMER_NOTIFICATIONS_ENABLED as DocumentNode,
        variables: { enabled },
      });
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to update customer notifications setting'
      );
    } finally {
      this.savingCustomerNotifications.set(false);
    }
  }

  async sendTestWhatsApp(): Promise<void> {
    const phone = this.testPhoneNumber().trim();
    const message = this.testMessage().trim();
    if (!phone || !message) {
      this.testWhatsAppResult.set({ success: false, message: 'Phone and message are required' });
      return;
    }
    this.sendingTestWhatsApp.set(true);
    this.testWhatsAppResult.set(null);
    try {
      const result = await this.apollo.getClient().mutate<{
        sendTestWhatsAppNotification: {
          success: boolean;
          channel?: string;
          error?: string;
          info?: string;
        };
      }>({
        mutation: SEND_TEST_WHATSAPP_NOTIFICATION as DocumentNode,
        variables: { phoneNumber: phone, message },
      });
      const data = result.data?.sendTestWhatsAppNotification;
      if (data?.success) {
        this.testWhatsAppResult.set({
          success: true,
          message: data.info ?? 'Test WhatsApp message queued',
        });
      } else {
        this.testWhatsAppResult.set({
          success: false,
          message: data?.error ?? 'Failed to send test WhatsApp message',
        });
      }
    } catch (err: unknown) {
      this.testWhatsAppResult.set({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send test WhatsApp message',
      });
    } finally {
      this.sendingTestWhatsApp.set(false);
    }
  }

  async sendTestCustomerNotification(): Promise<void> {
    const channelId = this.testChannelId().trim();
    const customerId = this.testCustomerId().trim();
    const triggerKey = this.testTriggerKey().trim();
    if (!channelId || !customerId || !triggerKey) {
      this.testCustomerNotificationResult.set({
        success: false,
        message: 'Channel, customer and trigger key are required',
      });
      return;
    }
    this.sendingTestCustomerNotification.set(true);
    this.testCustomerNotificationResult.set(null);
    try {
      const result = await this.apollo.getClient().mutate<{
        sendTestCustomerNotification: {
          success: boolean;
          channel?: string;
          error?: string;
          info?: string;
        };
      }>({
        mutation: SEND_TEST_CUSTOMER_NOTIFICATION as DocumentNode,
        variables: { channelId, customerId, triggerKey },
      });
      const data = result.data?.sendTestCustomerNotification;
      if (data?.success) {
        this.testCustomerNotificationResult.set({
          success: true,
          message: data.info ?? 'Test customer notification triggered',
        });
      } else {
        this.testCustomerNotificationResult.set({
          success: false,
          message: data?.error ?? 'Failed to trigger test customer notification',
        });
      }
    } catch (err: unknown) {
      this.testCustomerNotificationResult.set({
        success: false,
        message:
          err instanceof Error
            ? err.message
            : 'Failed to trigger test customer notification',
      });
    } finally {
      this.sendingTestCustomerNotification.set(false);
    }
  }
}

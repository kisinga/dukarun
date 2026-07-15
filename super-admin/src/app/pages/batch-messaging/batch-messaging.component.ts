import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApolloService } from '../../core/services/apollo.service';
import { PageHeaderComponent } from '../../shared/components/page-header';
import {
  BATCH_MESSAGES,
  PLATFORM_CHANNELS,
  SEND_BATCH_MESSAGE,
} from '../../core/graphql/operations.graphql';
import type { DocumentNode } from 'graphql';
import { renderBatchMessage } from './batch-message-template.util';

type Audience = 'ALL_ADMINS' | 'SUPER_ADMINS' | 'CHANNEL_ADMINS' | 'FINANCIAL_ADMINS' | 'CUSTOM_USER_IDS';

interface ChannelOption {
  id: string;
  code: string;
  name: string;
}

interface BatchMessageItem {
  id: string;
  name: string;
  content: string;
  audience: Audience;
  channelIds: string[] | null;
  channels: { sms: boolean; whatsapp: boolean };
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  ALL_ADMINS: 'All administrators',
  SUPER_ADMINS: 'Super admins only',
  CHANNEL_ADMINS: 'Channel admins',
  FINANCIAL_ADMINS: 'Financial admins',
  CUSTOM_USER_IDS: 'Custom user IDs',
};

const VARIABLES = ['firstName', 'shopName', 'shopCode'] as const;

@Component({
  selector: 'app-batch-messaging',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent],
  templateUrl: './batch-messaging.component.html',
  styleUrl: './batch-messaging.component.scss',
})
export class BatchMessagingComponent implements OnInit {
  private readonly apollo = inject(ApolloService);
  private readonly messageInput = viewChild<HTMLTextAreaElement>('messageInput');

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

  channels = signal<ChannelOption[]>([]);
  history = signal<BatchMessageItem[]>([]);
  historyTotal = signal(0);

  name = signal('');
  content = signal('');
  audience = signal<Audience>('ALL_ADMINS');
  selectedChannelIds = signal<Set<string>>(new Set());
  customUserIds = signal('');
  sendSms = signal(false);
  sendWhatsApp = signal(true);

  audienceOptions = Object.entries(AUDIENCE_LABELS) as [Audience, string][];
  variables = VARIABLES;

  isChannelScoped = computed(() => {
    const a = this.audience();
    return a === 'CHANNEL_ADMINS' || a === 'FINANCIAL_ADMINS';
  });

  isCustomUsers = computed(() => this.audience() === 'CUSTOM_USER_IDS');

  allChannelsSelected = computed(() => {
    const channels = this.channels();
    if (channels.length === 0) return false;
    const selected = this.selectedChannelIds();
    return channels.every(c => selected.has(c.id));
  });

  previewContext = computed(() => {
    const channelId = Array.from(this.selectedChannelIds())[0];
    const channel = this.channels().find(c => c.id === channelId);
    return {
      firstName: 'Jane',
      shopName: channel?.name || channel?.code || 'DukaRun',
      shopCode: channel?.code ?? 'dukarun',
    };
  });

  preview = computed(() => renderBatchMessage(this.content(), this.previewContext()));

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [channelsResult, historyResult] = await Promise.all([
        this.apollo.getClient().query<{ platformChannels: ChannelOption[] }>({
          query: PLATFORM_CHANNELS,
          fetchPolicy: 'network-only',
        }),
        this.apollo.getClient().query<{ batchMessages: { items: BatchMessageItem[]; totalItems: number } }>({
          query: BATCH_MESSAGES as DocumentNode,
          variables: { options: { skip: 0, take: 50 } },
          fetchPolicy: 'network-only',
        }),
      ]);
      this.channels.set((channelsResult.data?.platformChannels ?? []).map(c => ({ id: c.id, code: c.code, name: c.name })));
      this.history.set(historyResult.data?.batchMessages?.items ?? []);
      this.historyTotal.set(historyResult.data?.batchMessages?.totalItems ?? 0);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load broadcast data');
    } finally {
      this.loading.set(false);
    }
  }

  toggleChannel(channelId: string): void {
    const next = new Set(this.selectedChannelIds());
    if (next.has(channelId)) {
      next.delete(channelId);
    } else {
      next.add(channelId);
    }
    this.selectedChannelIds.set(next);
  }

  toggleSelectAll(): void {
    if (this.allChannelsSelected()) {
      this.selectedChannelIds.set(new Set());
    } else {
      this.selectedChannelIds.set(new Set(this.channels().map(c => c.id)));
    }
  }

  insertVariable(variable: string): void {
    const el = this.messageInput();
    if (!el) {
      this.content.update(c => `${c}{{${variable}}}`);
      return;
    }
    const start = el.selectionStart ?? this.content().length;
    const end = el.selectionEnd ?? this.content().length;
    const current = this.content();
    const next = `${current.slice(0, start)}{{${variable}}}${current.slice(end)}`;
    this.content.set(next);
    setTimeout(() => {
      const pos = start + `{{${variable}}}`.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async send(): Promise<void> {
    this.error.set(null);
    this.success.set(null);

    const name = this.name().trim();
    const content = this.content().trim();

    if (!name) {
      this.error.set('Campaign name is required');
      return;
    }
    if (!content) {
      this.error.set('Message content is required');
      return;
    }
    if (!this.sendSms() && !this.sendWhatsApp()) {
      this.error.set('Select at least one channel');
      return;
    }
    if (this.isCustomUsers() && !this.customUserIds().trim()) {
      this.error.set('Enter at least one user ID');
      return;
    }

    const input: {
      name: string;
      content: string;
      audience: Audience;
      channels: { sms: boolean; whatsapp: boolean };
      channelIds?: string[];
      customUserIds?: string[];
    } = {
      name,
      content,
      audience: this.audience(),
      channels: { sms: this.sendSms(), whatsapp: this.sendWhatsApp() },
    };

    if (this.isChannelScoped()) {
      input.channelIds = Array.from(this.selectedChannelIds());
    }

    if (this.isCustomUsers()) {
      input.customUserIds = this.customUserIds()
        .split(/[,\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
    }

    this.saving.set(true);
    try {
      await this.apollo.getClient().mutate({
        mutation: SEND_BATCH_MESSAGE as DocumentNode,
        variables: { input },
      });
      this.success.set('Campaign queued for sending');
      this.resetForm();
      await this.load();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to send campaign');
    } finally {
      this.saving.set(false);
    }
  }

  resetForm(): void {
    this.name.set('');
    this.content.set('');
    this.audience.set('ALL_ADMINS');
    this.selectedChannelIds.set(new Set());
    this.customUserIds.set('');
    this.sendSms.set(false);
    this.sendWhatsApp.set(true);
  }

  formatAudience(audience: Audience): string {
    return AUDIENCE_LABELS[audience] ?? audience;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'SENT':
        return 'badge-success';
      case 'PARTIAL':
        return 'badge-warning';
      case 'FAILED':
        return 'badge-error';
      case 'SENDING':
        return 'badge-info';
      default:
        return 'badge-ghost';
    }
  }
}

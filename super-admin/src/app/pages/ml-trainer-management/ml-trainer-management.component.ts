import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { ApolloService } from '../../core/services/apollo.service';
import {
  PLATFORM_CHANNELS,
  ML_TRAINER_HEALTH,
  ML_TRAINING_INFO,
  START_TRAINING,
  EXTRACT_PHOTOS_FOR_TRAINING,
  SET_ML_MODEL_STATUS,
  CLEAR_ML_MODEL,
} from '../../core/graphql/operations';

interface PlatformChannel {
  id: string;
  code: string;
  token: string;
  customFields: Record<string, unknown>;
}

interface MlTrainerHealth {
  status: string;
  uptimeSeconds?: number;
  error?: string;
}

interface MlTrainingInfo {
  status: string;
  progress: number;
  startedAt: string | null;
  error: string | null;
  productCount: number;
  imageCount: number;
  hasActiveModel: boolean;
  lastTrainedAt: string | null;
}

interface ChannelRow {
  channel: PlatformChannel;
  trainingInfo: MlTrainingInfo | null;
  loadError: string | null;
}

const POLL_INTERVAL_MS = 8000;

@Component({
  selector: 'app-ml-trainer-management',
  standalone: true,
  imports: [],
  templateUrl: './ml-trainer-management.component.html',
  styleUrl: './ml-trainer-management.component.scss',
})
export class MlTrainerManagementComponent implements OnInit, OnDestroy {
  private readonly apollo = inject(ApolloService);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  health = signal<MlTrainerHealth | null>(null);
  channels = signal<PlatformChannel[]>([]);
  rows = signal<ChannelRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  actionLoading = signal<string | null>(null);

  hasTrainingInProgress = computed(() =>
    this.rows().some(
      (r) => r.trainingInfo?.status === 'training'
    )
  );

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  ngOnDestroy(): void {
    this.clearPolling();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([this.loadHealth(), this.loadChannelsAndTraining()]);
      this.maybeStartPolling();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadHealth(): Promise<void> {
    try {
      const result = await this.apollo.getClient().query<{
        mlTrainerHealth: MlTrainerHealth;
      }>({
        query: ML_TRAINER_HEALTH,
        fetchPolicy: 'network-only',
      });
      this.health.set(result.data?.mlTrainerHealth ?? null);
    } catch {
      this.health.set({
        status: 'unavailable',
        error: 'Failed to load health',
      });
    }
  }

  private async loadChannelsAndTraining(): Promise<void> {
    const client = this.apollo.getClient();
    let channelList: PlatformChannel[] = [];
    try {
      const chResult = await client.query<{ platformChannels: PlatformChannel[] }>(
        { query: PLATFORM_CHANNELS, fetchPolicy: 'network-only' }
      );
      channelList = chResult.data?.platformChannels ?? [];
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to load channels'
      );
      this.rows.set([]);
      return;
    }

    const results = await Promise.allSettled(
      channelList.map((ch) =>
        client.query<{ mlTrainingInfo: MlTrainingInfo }>({
          query: ML_TRAINING_INFO,
          variables: { channelId: ch.id },
          fetchPolicy: 'network-only',
        })
      )
    );

    const rows: ChannelRow[] = channelList.map((channel, i) => {
      const settled = results[i];
      if (settled.status === 'fulfilled' && settled.value.data?.mlTrainingInfo) {
        return {
          channel,
          trainingInfo: settled.value.data.mlTrainingInfo,
          loadError: null,
        };
      }
      return {
        channel,
        trainingInfo: null,
        loadError:
          settled.status === 'rejected'
            ? (settled.reason?.message ?? 'Error loading')
            : 'No data',
      };
    });
    this.channels.set(channelList);
    this.rows.set(rows);
  }

  private maybeStartPolling(): void {
    if (this.hasTrainingInProgress()) {
      if (!this.pollTimer) {
        this.pollTimer = setInterval(() => {
          void this.loadChannelsAndTraining().then(() => {
            if (!this.hasTrainingInProgress()) this.clearPolling();
          });
        }, POLL_INTERVAL_MS);
      }
    } else {
      this.clearPolling();
    }
  }

  private clearPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  formatUptime(seconds?: number): string {
    if (seconds == null) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  formatDate(val: string | null): string {
    if (!val) return '—';
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  async extractPhotos(row: ChannelRow): Promise<void> {
    const id = row.channel.id;
    this.actionLoading.set(id);
    try {
      await this.apollo.getClient().mutate({
        mutation: EXTRACT_PHOTOS_FOR_TRAINING,
        variables: { channelId: id },
      });
      await this.refetchTrainingInfo(id);
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Extract photos failed'
      );
    } finally {
      this.actionLoading.set(null);
    }
  }

  async startTraining(row: ChannelRow): Promise<void> {
    if (row.trainingInfo?.status === 'training') return;
    const id = row.channel.id;
    this.actionLoading.set(id);
    try {
      await this.apollo.getClient().mutate({
        mutation: START_TRAINING,
        variables: { channelId: id },
      });
      await this.refetchTrainingInfo(id);
      this.maybeStartPolling();
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Start training failed'
      );
    } finally {
      this.actionLoading.set(null);
    }
  }

  async setStatus(row: ChannelRow, status: string): Promise<void> {
    const id = row.channel.id;
    this.actionLoading.set(id);
    try {
      await this.apollo.getClient().mutate({
        mutation: SET_ML_MODEL_STATUS,
        variables: { channelId: id, status },
      });
      await this.refetchTrainingInfo(id);
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Set status failed'
      );
    } finally {
      this.actionLoading.set(null);
    }
  }

  async clearModel(row: ChannelRow): Promise<void> {
    if (!confirm('Clear ML model for this channel? This cannot be undone.'))
      return;
    const id = row.channel.id;
    this.actionLoading.set(id);
    try {
      await this.apollo.getClient().mutate({
        mutation: CLEAR_ML_MODEL,
        variables: { channelId: id },
      });
      await this.refetchTrainingInfo(id);
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Clear model failed'
      );
    } finally {
      this.actionLoading.set(null);
    }
  }

  private async refetchTrainingInfo(channelId: string): Promise<void> {
    try {
      const result = await this.apollo.getClient().query<{
        mlTrainingInfo: MlTrainingInfo;
      }>({
        query: ML_TRAINING_INFO,
        variables: { channelId },
        fetchPolicy: 'network-only',
      });
      const info = result.data?.mlTrainingInfo ?? null;
      this.rows.update((list) =>
        list.map((r) =>
          r.channel.id === channelId
            ? { ...r, trainingInfo: info, loadError: null }
            : r
        )
      );
    } catch {
      this.rows.update((list) =>
        list.map((r) =>
          r.channel.id === channelId
            ? { ...r, loadError: 'Failed to refetch' }
            : r
        )
      );
    }
  }
}

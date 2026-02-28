import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ApolloService } from '../../core/services/apollo.service';
import type { DocumentNode } from 'graphql';
import {
  PLATFORM_CHANNELS,
  ML_TRAINER_HEALTH,
  ML_TRAINING_INFO,
  ML_TRAINING_DATA_SUMMARY,
  ML_SCHEDULER_CONFIG,
  ML_TRAINER_JOBS,
  ML_MODEL_INFO,
  QUEUE_TRAINING,
  START_TRAINING,
  EXTRACT_PHOTOS_FOR_TRAINING,
  SET_ML_MODEL_STATUS,
  CLEAR_ML_MODEL,
  REFRESH_TRAINING_COUNTS,
} from '../../core/graphql/operations.graphql';
import { TrainingExportService } from '../../core/services/training-export.service';
import { environment } from '../../../environments/environment';

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
  queuedAt: string | null;
}

interface MlTrainingDataSummary {
  extractedAt: string | null;
  productCount: number;
  imageCount: number;
  products: Array<{ productName: string; imageCount: number }>;
}

interface MlSchedulerConfig {
  intervalMinutes: number;
  cooldownHours: number;
}

interface MlTrainerJob {
  channelId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  error: string | null;
}

interface MlModelInfo {
  hasModel: boolean;
  version: string | null;
  status: string;
  modelJsonId: string | null;
  modelBinId: string | null;
  metadataId: string | null;
}

interface ChannelRow {
  channel: PlatformChannel;
  trainingInfo: MlTrainingInfo | null;
  loadError: string | null;
}

const POLL_INTERVAL_MS = 8000;
const SUCCESS_MESSAGE_DURATION_MS = 4000;

@Component({
  selector: 'app-ml-trainer-management',
  standalone: true,
  imports: [PageHeaderComponent],
  templateUrl: './ml-trainer-management.component.html',
  styleUrl: './ml-trainer-management.component.scss',
})
export class MlTrainerManagementComponent implements OnInit, OnDestroy {
  private readonly apollo = inject(ApolloService);
  private readonly trainingExport = inject(TrainingExportService);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private successMessageTimer: ReturnType<typeof setTimeout> | null = null;

  health = signal<MlTrainerHealth | null>(null);
  schedulerConfig = signal<MlSchedulerConfig | null>(null);
  trainerJobs = signal<MlTrainerJob[]>([]);
  channels = signal<PlatformChannel[]>([]);
  rows = signal<ChannelRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  actionLoading = signal<string | null>(null);
  detailModalChannelId = signal<string | null>(null);
  detailSummary = signal<MlTrainingDataSummary | null>(null);
  detailModelInfo = signal<MlModelInfo | null>(null);
  detailLoading = signal(false);
  errorModalRow = signal<ChannelRow | null>(null);
  exportProgress = signal<{ current: number; total: number } | null>(null);
  uploadModalChannelId = signal<string | null>(null);
  uploadFiles = signal<{ modelJson: File | null; weightsFile: File | null; metadata: File | null }>({
    modelJson: null,
    weightsFile: null,
    metadata: null,
  });

  detailModalRow = computed(() => {
    const id = this.detailModalChannelId();
    if (!id) return null;
    return this.rows().find((r) => r.channel.id === id) ?? null;
  });

  hasTrainingInProgress = computed(() =>
    this.rows().some(
      (r) => r.trainingInfo?.status === 'training'
    )
  );

  runningJobsCount = computed(() =>
    this.trainerJobs().filter((j) => j.status === 'running').length
  );

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  ngOnDestroy(): void {
    this.clearPolling();
    if (this.successMessageTimer) {
      clearTimeout(this.successMessageTimer);
      this.successMessageTimer = null;
    }
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([
        this.loadHealth(),
        this.loadSchedulerAndJobs(),
        this.loadChannelsAndTraining(),
      ]);
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

  private async loadSchedulerAndJobs(): Promise<void> {
    const client = this.apollo.getClient();
    try {
      const [configResult, jobsResult] = await Promise.all([
        client.query<{ mlSchedulerConfig: MlSchedulerConfig }>({
          query: ML_SCHEDULER_CONFIG,
          fetchPolicy: 'network-only',
        }),
        client.query<{ mlTrainerJobs: MlTrainerJob[] }>({
          query: ML_TRAINER_JOBS,
          fetchPolicy: 'network-only',
        }),
      ]);
      this.schedulerConfig.set(configResult.data?.mlSchedulerConfig ?? null);
      this.trainerJobs.set(jobsResult.data?.mlTrainerJobs ?? []);
    } catch {
      this.schedulerConfig.set(null);
      this.trainerJobs.set([]);
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
          void Promise.all([
            this.loadChannelsAndTraining(),
            this.loadSchedulerAndJobs(),
          ]).then(() => {
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

  private showSuccess(message: string): void {
    if (this.successMessageTimer) clearTimeout(this.successMessageTimer);
    this.successMessage.set(message);
    this.successMessageTimer = setTimeout(() => {
      this.successMessage.set(null);
      this.successMessageTimer = null;
    }, SUCCESS_MESSAGE_DURATION_MS);
  }

  openDetail(row: ChannelRow): void {
    this.detailModalChannelId.set(row.channel.id);
    this.detailSummary.set(null);
    this.detailModelInfo.set(null);
    this.loadDetailData(row.channel.id);
  }

  closeDetail(): void {
    this.detailModalChannelId.set(null);
    this.detailSummary.set(null);
    this.detailModelInfo.set(null);
  }

  async loadDetailData(channelId: string): Promise<void> {
    this.detailLoading.set(true);
    const client = this.apollo.getClient();
    try {
      const [summaryResult, modelResult] = await Promise.all([
        client.query<{ mlTrainingDataSummary: MlTrainingDataSummary }>({
          query: ML_TRAINING_DATA_SUMMARY,
          variables: { channelId },
          fetchPolicy: 'network-only',
        }),
        client.query<{ mlModelInfo: MlModelInfo }>({
          query: ML_MODEL_INFO,
          variables: { channelId },
          fetchPolicy: 'network-only',
        }),
      ]);
      this.detailSummary.set(summaryResult.data?.mlTrainingDataSummary ?? null);
      this.detailModelInfo.set(modelResult.data?.mlModelInfo ?? null);
    } catch {
      this.detailSummary.set(null);
      this.detailModelInfo.set(null);
    } finally {
      this.detailLoading.set(false);
    }
  }

  getTrainerJobForChannel(channelId: string): MlTrainerJob | null {
    return this.trainerJobs().find((j) => j.channelId === channelId) ?? null;
  }

  openErrorModal(row: ChannelRow): void {
    this.errorModalRow.set(row);
  }

  closeErrorModal(): void {
    this.errorModalRow.set(null);
  }

  async queueTraining(row: ChannelRow): Promise<void> {
    const id = row.channel.id;
    this.actionLoading.set(id);
    try {
      await this.apollo.getClient().mutate({
        mutation: QUEUE_TRAINING,
        variables: { channelId: id },
      });
      await this.refetchTrainingInfo(id);
      this.showSuccess('Queued for next scheduler run');
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Queue training failed'
      );
    } finally {
      this.actionLoading.set(null);
    }
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
      this.showSuccess('Photo extraction started');
      if (this.detailModalChannelId() === id) {
        this.loadDetailData(id);
      }
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
    if (!confirm('Start training now? This may take several minutes.')) return;
    const id = row.channel.id;
    this.actionLoading.set(id);
    try {
      await this.apollo.getClient().mutate({
        mutation: START_TRAINING,
        variables: { channelId: id },
      });
      await this.refetchTrainingInfo(id);
      this.showSuccess('Training started');
      this.maybeStartPolling();
      if (this.detailModalChannelId() === id) {
        this.loadChannelsAndTraining();
      }
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
      this.showSuccess(`Model set to ${status}`);
      if (this.detailModalChannelId() === id) {
        this.loadDetailData(id);
      }
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
      this.showSuccess('Model cleared');
      if (this.detailModalChannelId() === id) {
        this.loadDetailData(id);
      }
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

  async refreshCounts(row: ChannelRow): Promise<void> {
    const id = row.channel.id;
    this.actionLoading.set(id);
    try {
      await this.apollo.getClient().mutate({
        mutation: REFRESH_TRAINING_COUNTS as DocumentNode,
        variables: { channelId: id },
      });
      await this.refetchTrainingInfo(id);
      this.showSuccess('Counts refreshed');
      if (this.detailModalChannelId() === id) {
        this.loadDetailData(id);
      }
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Refresh counts failed'
      );
    } finally {
      this.actionLoading.set(null);
    }
  }

  async downloadImagesZip(row: ChannelRow): Promise<void> {
    const id = row.channel.id;
    const code = (row.channel as PlatformChannel).code ?? id;
    this.actionLoading.set(id);
    this.exportProgress.set({ current: 0, total: 1 });
    try {
      await this.trainingExport.downloadImagesZip(id, code, (current, total) => {
        this.exportProgress.set({ current, total });
      });
      this.showSuccess('Images zip downloaded');
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Download images failed'
      );
    } finally {
      this.actionLoading.set(null);
      this.exportProgress.set(null);
    }
  }

  openUploadModal(row: ChannelRow): void {
    this.uploadModalChannelId.set(row.channel.id);
    this.uploadFiles.set({ modelJson: null, weightsFile: null, metadata: null });
  }

  closeUploadModal(): void {
    this.uploadModalChannelId.set(null);
    this.uploadFiles.set({ modelJson: null, weightsFile: null, metadata: null });
  }

  onUploadFileSelected(field: 'modelJson' | 'weightsFile' | 'metadata', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.uploadFiles.update((prev) => ({ ...prev, [field]: file }));
  }

  async uploadModel(): Promise<void> {
    const channelId = this.uploadModalChannelId();
    if (!channelId) return;
    const files = this.uploadFiles();
    if (!files.modelJson || !files.weightsFile || !files.metadata) {
      this.error.set('Please select all three files: model.json, weights.bin, metadata.json');
      return;
    }
    this.actionLoading.set(channelId);
    try {
      await this.uploadModelMultipart(channelId, files.modelJson, files.weightsFile, files.metadata);
      await this.refetchTrainingInfo(channelId);
      this.showSuccess('Model uploaded');
      this.closeUploadModal();
      if (this.detailModalChannelId() === channelId) {
        this.loadDetailData(channelId);
      }
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Upload model failed'
      );
    } finally {
      this.actionLoading.set(null);
    }
  }

  /**
   * Send multipart GraphQL request for uploadModelManually (Apollo HttpLink does not support File variables).
   */
  private async uploadModelMultipart(
    channelId: string,
    modelJson: File,
    weightsFile: File,
    metadata: File
  ): Promise<void> {
    const query = `
      mutation UploadModelManually($channelId: ID!, $modelJson: Upload!, $weightsFile: Upload!, $metadata: Upload!) {
        uploadModelManually(channelId: $channelId, modelJson: $modelJson, weightsFile: $weightsFile, metadata: $metadata)
      }
    `;
    const formData = new FormData();
    formData.append('operations', JSON.stringify({
      query,
      variables: { channelId, modelJson: null, weightsFile: null, metadata: null },
    }));
    formData.append('map', JSON.stringify({
      '0': ['variables.modelJson'],
      '1': ['variables.weightsFile'],
      '2': ['variables.metadata'],
    }));
    formData.append('0', modelJson);
    formData.append('1', weightsFile);
    formData.append('2', metadata);

    const res = await fetch(environment.apiUrl, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Upload failed: ${res.status}`);
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(json.errors[0]?.message ?? 'Upload failed');
    }
  }
}

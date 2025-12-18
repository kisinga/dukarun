import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CompanyService } from '../../../../../core/services/company.service';
import { ModelSourceResolverService } from '../../../../../core/services/ml-model/model-source-resolver.service';
import {
  MlTrainingInfo,
  MlTrainingService,
} from '../../../../../core/services/ml-training.service';
import { NotificationStateService } from '../../../../../core/services/notification/notification-state.service';

interface LoadedModelMetadata {
  trainingId?: string;
  modelName?: string;
  trainedAt?: string;
  productCount?: number;
  imageCount?: number;
  labels?: string[];
  version?: string;
}

@Component({
  selector: 'app-ml-model-status',
  imports: [CommonModule, DatePipe],
  templateUrl: './ml-model-status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MlModelStatusComponent implements OnInit {
  private readonly companyService = inject(CompanyService);
  private readonly notificationStateService = inject(NotificationStateService);
  private readonly trainingService = inject(MlTrainingService);
  private readonly sourceResolver = inject(ModelSourceResolverService);

  readonly mlModelAssets = this.companyService.mlModelAssets;

  // Local signals for template binding (more reliable with OnPush)
  readonly trainingInfo = signal<MlTrainingInfo | null>(null);
  readonly loadedModelMetadata = signal<LoadedModelMetadata | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly lastMlNotificationCount = signal(0);

  readonly isModelFullyConfigured = computed(() => {
    return this.trainingInfo()?.status === 'active';
  });

  readonly configurationProgress = computed(() => {
    return this.trainingInfo()?.progress ?? 0;
  });

  // Status helpers based on local signal
  readonly isIdle = computed(() => this.trainingInfo()?.status === 'idle');
  readonly isExtracting = computed(() => this.trainingInfo()?.status === 'extracting');
  readonly isReady = computed(() => this.trainingInfo()?.status === 'ready');
  readonly isTraining = computed(() => this.trainingInfo()?.status === 'training');
  readonly isActive = computed(() => this.trainingInfo()?.status === 'active');
  readonly isFailed = computed(() => this.trainingInfo()?.status === 'failed');

  readonly isTrainingInProgress = computed(() => {
    const status = this.trainingInfo()?.status;
    return status === 'extracting' || status === 'training';
  });

  // Computed: count of unread ML notifications
  private readonly unreadMlNotificationCount = computed(() => {
    const notifications = this.notificationStateService.notifications();
    return notifications.filter((n) => n.type === 'ML_TRAINING' && !n.read).length;
  });

  constructor() {
    // Auto-refresh when new ML notifications arrive
    effect(
      () => {
        const currentCount = this.unreadMlNotificationCount();
        const lastCount = this.lastMlNotificationCount();

        if (currentCount > lastCount) {
          this.loadData();
        }

        this.lastMlNotificationCount.set(currentCount);
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    const channelId = this.companyService.activeCompanyId();
    console.log('[MlModelStatus] loadData called, channelId:', channelId);

    if (!channelId) {
      console.warn('[MlModelStatus] No active channel ID available');
      return;
    }

    this.loading.set(true);

    // Load training info
    this.trainingService.getTrainingInfo(channelId).subscribe({
      next: (info) => {
        console.log('[MlModelStatus] Training info received:', info);
        this.trainingInfo.set(info);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err) => {
        console.error('[MlModelStatus] Failed to load training info:', err);
        this.loading.set(false);
        this.error.set(err.message);
      },
    });

    // Load model metadata if model files exist
    await this.loadModelMetadata(channelId);

    this.companyService.fetchActiveChannel();
  }

  /**
   * Load model metadata from the metadata file
   */
  private async loadModelMetadata(channelId: string): Promise<void> {
    try {
      const sources = await this.sourceResolver.getModelSources(channelId);
      if (!sources) {
        this.loadedModelMetadata.set(null);
        return;
      }

      const metadataResponse = await fetch(sources.metadataUrl, {
        credentials: 'include',
      });

      if (!metadataResponse.ok) {
        this.loadedModelMetadata.set(null);
        return;
      }

      const metadata = await metadataResponse.json();
      console.log('[MlModelStatus] Loaded model metadata:', metadata);

      this.loadedModelMetadata.set({
        trainingId: metadata.trainingId,
        modelName: metadata.modelName,
        trainedAt: metadata.trainedAt,
        productCount: metadata.productCount,
        imageCount: metadata.imageCount,
        labels: metadata.labels,
        version: metadata.version,
      });
    } catch (error) {
      console.warn('[MlModelStatus] Failed to load model metadata:', error);
      this.loadedModelMetadata.set(null);
    }
  }

  extractPhotos(): void {
    const channelId = this.companyService.activeCompanyId();
    if (!channelId) return;

    this.loading.set(true);
    this.trainingService.extractPhotos(channelId).subscribe({
      next: (success) => {
        if (success) {
          console.log('Photo extraction started');
          this.loadData(); // Refresh after extraction
        }
      },
      error: (err) => {
        console.error('Failed to extract photos:', err);
        this.loading.set(false);
      },
    });
  }

  downloadManifest(): void {
    const channelId = this.companyService.activeCompanyId();
    if (channelId) this.trainingService.downloadManifest(channelId);
  }

  refresh(): void {
    this.loadData();
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'idle':
        return 'Ready to extract photos';
      case 'extracting':
        return 'Extracting photos...';
      case 'ready':
        return 'Ready to train';
      case 'training':
        return 'Training in progress...';
      case 'active':
        return 'Model active';
      case 'failed':
        return 'Training failed';
      default:
        return 'Unknown status';
    }
  }
}

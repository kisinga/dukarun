import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { MlTrainingService } from '../../../../core/services/ml-training.service';

/**
 * ML Training Status Component
 *
 * Displays training status, progress, and controls for ML model training.
 * Used in channel settings to manage ML model training workflow.
 */
@Component({
  selector: 'app-ml-training-status',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .status-badge {
        transition: all 200ms ease;
      }

      .progress-bar {
        transition: width 300ms ease;
      }

      .btn-loading {
        position: relative;
      }

      .btn-loading:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .spinner {
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  template: `
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-bold text-lg">AI Model Training</h3>
            <p class="text-sm opacity-70">Manage photo extraction and model training</p>
          </div>

          <!-- Status Badge -->
          @if (trainingService.trainingInfo(); as info) {
            <div class="status-badge status-{{ trainingService.statusColor() }}">
              {{ trainingService.getStatusText(info.status) }}
            </div>
          }
        </div>

        <!-- Schema Not Available Message -->
        @if (trainingService.error() && trainingService.error()!.includes('not available')) {
          <div class="alert alert-warning">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div>
              <div class="font-bold">ML Training Features Not Available</div>
              <div class="text-sm">
                Please restart the backend server to enable the new ML training schema.
              </div>
            </div>
          </div>
        }

        <!-- Training Info -->
        @if (trainingService.trainingInfo(); as info) {
          <div class="space-y-4">
            <!-- Progress Bar -->
            @if (trainingService.isTrainingInProgress()) {
              <div class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{{ info.progress }}%</span>
                </div>
                <progress
                  class="progress progress-primary w-full"
                  [value]="info.progress"
                  max="100"
                ></progress>
              </div>
            }

            <!-- Stats Grid -->
            <div class="grid grid-cols-2 gap-4">
              <div class="stat bg-base-200 rounded-lg p-3">
                <div class="stat-title text-xs">Products</div>
                <div class="stat-value text-lg">{{ info.productCount }}</div>
              </div>
              <div class="stat bg-base-200 rounded-lg p-3">
                <div class="stat-title text-xs">Images</div>
                <div class="stat-value text-lg">{{ info.imageCount }}</div>
              </div>
            </div>

            <!-- Error Message -->
            @if (info.error) {
              <div class="alert alert-error">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="stroke-current shrink-0 h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <div class="font-bold">Training Error</div>
                  <div class="text-sm">{{ info.error }}</div>
                </div>
              </div>
            }

            <!-- Last Trained -->
            @if (info.lastTrainedAt) {
              <div class="text-xs opacity-60">
                Last trained: {{ info.lastTrainedAt | date: 'short' }}
              </div>
            }
          </div>
        }

        <!-- Action Buttons -->
        <div class="card-actions justify-end mt-6">
          <!-- Extract Photos Button -->
          @if (trainingService.isIdle() || trainingService.isFailed()) {
            <button
              class="btn btn-primary btn-sm"
              [class.btn-loading]="trainingService.loading()"
              [disabled]="trainingService.loading()"
              (click)="extractPhotos()"
            >
              @if (trainingService.loading()) {
                <span class="loading loading-spinner loading-xs"></span>
              }
              Prepare Training Data
            </button>
          }

          <!-- Download Manifest Button -->
          @if (trainingService.isReady() || trainingService.isActive()) {
            <button class="btn btn-outline btn-sm" (click)="downloadManifest()">
              📥 Download Manifest
            </button>
          }

          <!-- Refresh Button -->
          <button class="btn btn-ghost btn-sm" (click)="refresh()">🔄 Refresh</button>
        </div>

        <!-- Help Text -->
        <div class="mt-4 p-3 bg-base-200 rounded-lg">
          <div class="text-xs space-y-1">
            <div><strong>Status Guide:</strong></div>
            <div>• <span class="text-gray-500">Idle</span> - Ready to extract photos</div>
            <div>• <span class="text-blue-500">Extracting</span> - Processing product images</div>
            <div>• <span class="text-green-500">Ready</span> - Queued for auto-training</div>
            <div>• <span class="text-blue-500">Training</span> - Model training in progress</div>
            <div>• <span class="text-green-500">Active</span> - Model ready for use</div>
            <div>• <span class="text-red-500">Failed</span> - Training encountered an error</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MlTrainingStatusComponent {
  // Inputs
  readonly channelId = input.required<string>();

  // Services
  readonly trainingService = inject(MlTrainingService);

  // Local state
  private initialized = signal(false);

  constructor() {
    // Auto-refresh when channelId changes
    effect(() => {
      const channelId = this.channelId();
      if (channelId && !this.initialized()) {
        this.initialize(channelId);
      }
    });
  }

  /**
   * Initialize component with channel data
   */
  private initialize(channelId: string): void {
    this.trainingService.getTrainingInfo(channelId).subscribe({
      next: () => {
        this.initialized.set(true);
      },
      error: (error) => {
        console.error('Failed to load training info:', error);
      },
    });
  }

  /**
   * Extract photos for training
   */
  extractPhotos(): void {
    const channelId = this.channelId();
    this.trainingService.extractPhotos(channelId).subscribe({
      next: (success) => {
        if (success) {
          console.log('Photo extraction started');
        }
      },
      error: (error) => {
        console.error('Failed to extract photos:', error);
      },
    });
  }

  /**
   * Download training manifest
   */
  downloadManifest(): void {
    const channelId = this.channelId();
    this.trainingService.downloadManifest(channelId);
  }

  /**
   * Refresh training info
   */
  refresh(): void {
    const channelId = this.channelId();
    this.trainingService.refresh(channelId);
  }
}

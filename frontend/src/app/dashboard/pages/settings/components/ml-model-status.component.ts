import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { CompanyService } from '../../../../core/services/company.service';

@Component({
  selector: 'app-ml-model-status',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body space-y-6">
        <!-- ML Model Status Header -->
        <div>
          <h2 class="text-2xl font-bold">ML Model Status</h2>
          <p class="text-sm text-base-content/60 mt-1">
            Current machine learning model configuration and training status
          </p>
        </div>

        <!-- Model Assets Status -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Model JSON Asset -->
          <div class="card bg-base-200">
            <div class="card-body p-4">
              <div>
                <h3 class="font-semibold">Model JSON</h3>
                <p class="text-xs text-base-content/60">Model architecture file</p>
              </div>
              <div class="mt-3">
                @if (mlModelAssets()?.mlModelJsonAsset) {
                  <div class="badge badge-success gap-2">READY</div>
                  <p class="text-xs mt-1">{{ mlModelAssets()?.mlModelJsonAsset?.name }}</p>
                } @else {
                  <div class="badge badge-error">Not configured</div>
                }
              </div>
            </div>
          </div>

          <!-- Model Weights Asset -->
          <div class="card bg-base-200">
            <div class="card-body p-4">
              <div>
                <div>
                  <h3 class="font-semibold">Model Weights</h3>
                  <p class="text-xs text-base-content/60">Trained model weights</p>
                </div>
              </div>
              <div class="mt-3">
                @if (mlModelAssets()?.mlModelBinAsset) {
                  <div class="badge badge-success gap-2">READY</div>
                  <p class="text-xs mt-1">{{ mlModelAssets()?.mlModelBinAsset?.name }}</p>
                } @else {
                  <div class="badge badge-error">Not configured</div>
                }
              </div>
            </div>
          </div>

          <!-- Metadata Asset -->
          <div class="card bg-base-200">
            <div class="card-body p-4">
              <div>
                <h3 class="font-semibold">Metadata</h3>
                <p class="text-xs text-base-content/60">Model metadata file</p>
              </div>
              <div class="mt-3">
                @if (mlModelAssets()?.mlMetadataAsset) {
                  <div class="badge badge-success gap-2">READY</div>
                  <p class="text-xs mt-1">{{ mlModelAssets()?.mlMetadataAsset?.name }}</p>
                } @else {
                  <div class="badge badge-error">Not configured</div>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Overall Status -->
        <div class="divider"></div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="text-3xl">
              @if (isModelFullyConfigured()) {
                ✅
              } @else {
                ❌
              }
            </div>
            <div>
              <h3 class="text-lg font-semibold">Overall Status</h3>
              <p class="text-sm text-base-content/60">
                @if (isModelFullyConfigured()) {
                  ML Model is fully configured and ready
                } @else {
                  ML Model configuration incomplete
                }
              </p>
            </div>
          </div>

          <div class="text-right">
            @if (isModelFullyConfigured()) {
              <div class="badge badge-success badge-lg gap-2">Ready</div>
            } @else {
              <div class="badge badge-warning badge-lg">Incomplete</div>
            }
          </div>
        </div>

        <!-- Configuration Progress -->
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>Configuration Progress</span>
            <span>{{ configurationProgress() }}%</span>
          </div>
          <progress
            class="progress progress-primary w-full"
            [value]="configurationProgress()"
            max="100"
          ></progress>
        </div>

        <!-- Actions -->
        <div class="card-actions justify-end">
          @if (!isModelFullyConfigured()) {
            <button class="btn btn-outline">📝 Configure ML Model</button>
          }
          <button class="btn btn-primary">🔄 Refresh Status</button>
        </div>
      </div>
    </div>
  `,
})
export class MlModelStatusComponent {
  private readonly companyService = inject(CompanyService);

  readonly mlModelAssets = this.companyService.mlModelAssets;

  readonly isModelFullyConfigured = computed(() => {
    const assets = this.mlModelAssets();
    return !!(assets?.mlModelJsonAsset && assets?.mlModelBinAsset && assets?.mlMetadataAsset);
  });

  readonly configurationProgress = computed(() => {
    const assets = this.mlModelAssets();
    if (!assets) return 0;

    let configured = 0;
    if (assets.mlModelJsonAsset) configured++;
    if (assets.mlModelBinAsset) configured++;
    if (assets.mlMetadataAsset) configured++;

    return Math.round((configured / 3) * 100);
  });

  constructor() {
    // Refresh company data to get latest ML model status
    effect(() => {
      this.companyService.fetchActiveChannel();
    });
  }
}

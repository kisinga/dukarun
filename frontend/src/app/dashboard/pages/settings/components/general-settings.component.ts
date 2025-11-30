import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CompanyService } from '../../../../core/services/company.service';
import {
  ChannelSettings,
  SettingsService,
  UpdateChannelSettingsInput,
} from '../../../../core/services/settings.service';

@Component({
  selector: 'app-general-settings',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body space-y-6">
        <!-- Company Logo -->
        <div class="form-control">
          <label class="label">
            <span class="label-text font-semibold">Company Logo</span>
          </label>

          <!-- Logo Display -->
          <div class="flex items-center gap-4">
            <!-- Current Logo or Preview -->
            @if (selectedLogoFile(); as selectedFile) {
              <!-- New logo preview (file selected but not saved) -->
              <div class="avatar">
                <div class="w-24 rounded">
                  <img [src]="logoPreview()" alt="New Logo Preview" />
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <span class="text-sm text-primary font-medium">New logo selected</span>
                <button class="btn btn-xs btn-error" (click)="removeSelectedLogo()">
                  Remove
                </button>
              </div>
            } @else if (companyLogoAsset(); as logoAsset) {
              <!-- WORKAROUND: Use CompanyService logo due to SettingsService custom field relation loading issues -->
              <div class="avatar">
                <div class="w-24 rounded">
                  <img [src]="logoAsset.preview || logoAsset.source" alt="Current Company Logo" />
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <span class="text-sm text-success">Current logo</span>
                <div class="flex gap-1">
                  <button class="btn btn-xs btn-outline" (click)="selectLogoFile()">
                    Change
                  </button>
                  <button class="btn btn-xs btn-error" (click)="removeExistingLogo()">
                    Remove
                  </button>
                </div>
              </div>
            } @else {
              <!-- No logo -->
              <div class="w-24 h-24 bg-base-200 rounded flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-8 w-8 text-base-content/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div class="flex flex-col gap-2">
                <span class="text-sm text-base-content/60">No logo set</span>
                <button class="btn btn-xs btn-primary" (click)="selectLogoFile()">
                  Add Logo
                </button>
              </div>
            }
          </div>
        </div>

        <!-- Cashier Flow Toggle -->
        <div class="form-control">
          <label class="label cursor-pointer">
            <span class="label-text">
              <div class="font-semibold">Enable Cashier Approval Flow</div>
              <div class="text-xs opacity-70">
                Orders require cashier approval before completion
              </div>
            </span>
            <input
              type="checkbox"
              class="toggle toggle-primary"
              [checked]="settings()?.cashierFlowEnabled"
              (change)="toggleCashierFlow($event)"
            />
          </label>
        </div>

        <!-- Cashier Open Status -->
        @if (settings()?.cashierFlowEnabled) {
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">
                <div class="font-semibold">Cashier Currently Open</div>
                <div class="text-xs opacity-70">
                  Real-time status: Is a cashier currently serving?
                </div>
              </span>
              <input
                type="checkbox"
                class="toggle toggle-success"
                [checked]="settings()?.cashierOpen"
                (change)="toggleCashierOpen($event)"
              />
            </label>
          </div>
        }

        <!-- Save Button -->
        <div class="card-actions justify-end">
          <button
            class="btn btn-primary"
            [disabled]="!hasChanges() || settingsService.loading()"
            (click)="saveSettings()"
          >
            @if (settingsService.loading()) {
              <span class="loading loading-spinner loading-xs"></span>
            }
            Save Changes
          </button>
        </div>

        <!-- Error Message -->
        @if (settingsService.error(); as error) {
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
            <span>{{ error }}</span>
          </div>
        }
      </div>
    </div>
  `,
})
export class GeneralSettingsComponent {
  readonly settingsService = inject(SettingsService);
  private readonly companyService = inject(CompanyService);
  private readonly settingsState = signal<ChannelSettings | null>(null);
  readonly settings = this.settingsState.asReadonly();
  readonly hasChanges = signal(false);
  readonly selectedLogoFile = signal<File | null>(null);
  readonly logoPreview = signal<string | null>(null);

  // WORKAROUND: Use CompanyService for logo due to custom field relation loading issues in SettingsService
  readonly companyLogoAsset = this.companyService.companyLogoAsset;

  private originalSettings: ChannelSettings | null = null;
  private lastRemoteSnapshot: ChannelSettings | null = null;

  constructor() {
    effect(() => {
      const remoteSettings = this.settingsService.channelSettings();
      const hasChanges = this.hasChanges();

      if (!remoteSettings) {
        this.settingsState.set(null);
        this.originalSettings = null;
        this.lastRemoteSnapshot = null;
        return;
      }

      const remoteChanged =
        !this.lastRemoteSnapshot || !this.areSettingsEqual(this.lastRemoteSnapshot, remoteSettings);

      if (remoteChanged) {
        this.lastRemoteSnapshot = { ...remoteSettings };
        this.originalSettings = { ...remoteSettings };

        if (!hasChanges) {
          this.settingsState.set({ ...remoteSettings });
          this.logoPreview.set(null);
          this.selectedLogoFile.set(null);
          this.evaluateChanges(remoteSettings);
        }
      } else if (!this.settingsState()) {
        this.settingsState.set({ ...remoteSettings });
        this.evaluateChanges(remoteSettings);
      }
    });
  }

  private areSettingsEqual(a: ChannelSettings, b: ChannelSettings): boolean {
    return (
      a.cashierFlowEnabled === b.cashierFlowEnabled &&
      a.cashierOpen === b.cashierOpen &&
      (a.companyLogoAsset?.id ?? null) === (b.companyLogoAsset?.id ?? null)
    );
  }

  private evaluateChanges(next: ChannelSettings | null): void {
    if (!next || !this.originalSettings) {
      this.hasChanges.set(false);
      return;
    }

    this.hasChanges.set(!this.areSettingsEqual(next, this.originalSettings));
  }

  toggleCashierFlow(event: Event): void {
    const target = event.target as HTMLInputElement;

    // If disabling cashier flow, also disable cashier open
    this.settingsState.update((settings) => {
      if (!settings) {
        return settings;
      }

      if (!target.checked) {
        return {
          ...settings,
          cashierFlowEnabled: false,
          cashierOpen: false,
        };
      }

      return {
        ...settings,
        cashierFlowEnabled: true,
      };
    });

    this.evaluateChanges(this.settingsState());
  }

  toggleCashierOpen(event: Event): void {
    const target = event.target as HTMLInputElement;

    this.settingsState.update((settings) => {
      if (!settings) {
        return settings;
      }
      return {
        ...settings,
        cashierOpen: target.checked,
      };
    });

    this.evaluateChanges(this.settingsState());
  }

  selectLogoFile(): void {
    console.log('📁 Opening file picker...');

    // Create file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml';

    input.onchange = (event: Event) => {
      console.log('📁 File selected:', event);

      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) {
        console.log('❌ No file selected');
        return;
      }

      console.log('📄 File details:', {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }

      // Store selected file and generate preview
      this.selectedLogoFile.set(file);

      // Generate preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = e.target?.result as string;
        this.logoPreview.set(preview);
        this.hasChanges.set(true);
        console.log('✅ Logo preview generated');
      };
      reader.readAsDataURL(file);
    };

    input.click();
  }

  removeSelectedLogo(): void {
    this.selectedLogoFile.set(null);
    this.logoPreview.set(null);
    this.evaluateChanges(this.settings());
  }

  removeExistingLogo(): void {
    // Clear the preview and mark for removal
    this.logoPreview.set(null);
    this.selectedLogoFile.set(null);
    this.settingsState.update((settings) => {
      if (!settings) {
        return settings;
      }
      return {
        ...settings,
        companyLogoAsset: null,
      };
    });
    this.evaluateChanges(this.settings());
    console.log('🗑️ Marked existing logo for removal');
  }

  async saveSettings(): Promise<void> {
    const currentSettings = this.settings();
    if (!currentSettings) return;

    let logoAssetId: string | null | undefined = currentSettings.companyLogoAsset?.id ?? undefined;

    // Upload logo if a new file was selected
    const selectedFile = this.selectedLogoFile();
    if (selectedFile) {
      console.log('🚀 Uploading selected logo file...');
      const uploadedAssetId = await this.settingsService.uploadLogo(selectedFile);

      if (!uploadedAssetId) {
        console.error('❌ Failed to upload logo');
        return;
      }

      logoAssetId = uploadedAssetId;
      console.log('✅ Logo uploaded successfully');
    } else if (!this.logoPreview() && currentSettings.companyLogoAsset) {
      // Logo was removed (preview cleared but no new file selected)
      logoAssetId = null;
      console.log('🗑️ Logo marked for removal');
    }

    const updateInput: UpdateChannelSettingsInput = {
      cashierFlowEnabled: currentSettings.cashierFlowEnabled,
      cashierOpen: currentSettings.cashierOpen,
      companyLogoAssetId: logoAssetId,
    };

    console.log('💾 Updating channel settings with logo asset ID:', logoAssetId);
    await this.settingsService.updateChannelSettings(updateInput);

    if (!this.settingsService.error()) {
      // Clear selected file but keep preview (it will be updated with the new logo)
      this.selectedLogoFile.set(null);
      this.originalSettings = { ...currentSettings };
      this.evaluateChanges(this.settings());

      // The effect watching channel settings will sync UI state
      console.log('✅ Settings saved and refreshed');
    }
  }
}

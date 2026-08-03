import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CompanyService } from '@dukarun/company';
import { ChannelSettings, SettingsService } from '@dukarun/company';

@Component({
  selector: 'app-general-settings',
  imports: [CommonModule, ReactiveFormsModule, NgIcon],
  templateUrl: './general-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeneralSettingsComponent {
  readonly settingsService = inject(SettingsService);
  private readonly companyService = inject(CompanyService);

  private readonly settingsState = signal<ChannelSettings | null>(null);
  readonly settings = this.settingsState.asReadonly();
  readonly selectedLogoFile = signal<File | null>(null);
  readonly logoPreview = signal<string | null>(null);
  readonly companyLogoAsset = this.companyService.companyLogoAsset;

  private readonly originalSettings = signal<ChannelSettings | null>(null);

  /** Derived: true when local state differs from the last-saved snapshot. */
  readonly hasChanges = computed(() => {
    const current = this.settingsState();
    const original = this.originalSettings();
    if (!current || !original) return false;
    if (this.selectedLogoFile() !== null) return true;
    return !this.areSettingsEqual(current, original);
  });

  constructor() {
    // Sync remote settings → local state.
    // Only tracks channelSettings(); reads hasChanges via untracked to avoid circular re-runs.
    effect(() => {
      const remote = this.settingsService.channelSettings();

      if (!remote) {
        this.settingsState.set(null);
        this.originalSettings.set(null);
        return;
      }

      // Always update the "original" baseline to match the server.
      this.originalSettings.set({ ...remote });

      // Only overwrite local edits when the user has no pending changes.
      if (!untracked(() => this.hasChanges())) {
        this.settingsState.set({ ...remote });
        this.logoPreview.set(null);
        this.selectedLogoFile.set(null);
      }
    });
  }

  private areSettingsEqual(a: ChannelSettings, b: ChannelSettings): boolean {
    return (
      a.cashierFlowEnabled === b.cashierFlowEnabled &&
      a.batchExpiryEnabled === b.batchExpiryEnabled &&
      a.lowStockThreshold === b.lowStockThreshold &&
      a.enablePrinter === b.enablePrinter &&
      (a.companyLogoAsset?.id ?? null) === (b.companyLogoAsset?.id ?? null)
    );
  }

  toggleCashierFlow(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settingsState.update((s) => (s ? { ...s, cashierFlowEnabled: checked } : s));
  }

  toggleBatchExpiry(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settingsState.update((s) => (s ? { ...s, batchExpiryEnabled: checked } : s));
  }

  updateLowStockThreshold(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.settingsState.update((s) =>
      s ? { ...s, lowStockThreshold: Number.isNaN(value) ? 0 : value } : s,
    );
  }

  togglePrinter(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.settingsState.update((s) => (s ? { ...s, enablePrinter: checked } : s));
  }

  selectLogoFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp,image/svg+xml';

    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }

      this.selectedLogoFile.set(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        this.logoPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    };

    input.click();
  }

  removeSelectedLogo(): void {
    this.selectedLogoFile.set(null);
    this.logoPreview.set(null);
  }

  removeExistingLogo(): void {
    this.logoPreview.set(null);
    this.selectedLogoFile.set(null);
    this.settingsState.update((s) => (s ? { ...s, companyLogoAsset: null } : s));
  }

  async saveSettings(): Promise<void> {
    const currentSettings = this.settings();
    if (!currentSettings) return;

    const original = this.originalSettings();
    let logoAssetId: string | null | undefined = undefined;
    const currentLogo = currentSettings.companyLogoAsset;
    const originalLogo = original?.companyLogoAsset;

    const selectedFile = this.selectedLogoFile();
    if (selectedFile) {
      const uploadedAssetId = await this.settingsService.uploadLogo(selectedFile);
      if (!uploadedAssetId) return;
      logoAssetId = uploadedAssetId;
    } else {
      if (currentLogo === null && originalLogo) {
        logoAssetId = null;
      } else if (currentLogo?.id !== originalLogo?.id) {
        logoAssetId = currentLogo?.id;
      }
    }

    if (logoAssetId !== undefined) {
      await this.settingsService.updateChannelLogo(logoAssetId);
    }

    if (currentSettings.cashierFlowEnabled !== original?.cashierFlowEnabled) {
      await this.settingsService.updateCashierSettings(currentSettings.cashierFlowEnabled);
    }

    if (
      currentSettings.batchExpiryEnabled !== original?.batchExpiryEnabled ||
      currentSettings.lowStockThreshold !== original?.lowStockThreshold
    ) {
      await this.settingsService.updateBatchExpirySettings(
        currentSettings.batchExpiryEnabled,
        currentSettings.lowStockThreshold,
      );
    }

    if (currentSettings.enablePrinter !== original?.enablePrinter) {
      await this.settingsService.updatePrinterSettings(currentSettings.enablePrinter);
    }

    if (!this.settingsService.error()) {
      this.selectedLogoFile.set(null);
      this.logoPreview.set(null);
      // originalSettings will be updated by the effect when channelSettings refreshes
    }
  }
}

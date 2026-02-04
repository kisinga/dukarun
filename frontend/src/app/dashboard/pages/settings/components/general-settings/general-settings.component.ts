import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CompanyService } from '../../../../../core/services/company.service';
import { ChannelSettings, SettingsService } from '../../../../../core/services/settings.service';

@Component({
  selector: 'app-general-settings',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './general-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeneralSettingsComponent {
  readonly settingsService = inject(SettingsService);
  private readonly companyService = inject(CompanyService);
  private readonly settingsState = signal<ChannelSettings | null>(null);
  readonly settings = this.settingsState.asReadonly();
  readonly hasChanges = signal(false);
  readonly selectedLogoFile = signal<File | null>(null);
  readonly logoPreview = signal<string | null>(null);
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
      a.enablePrinter === b.enablePrinter &&
      (a.companyLogoAsset?.id ?? null) === (b.companyLogoAsset?.id ?? null)
    );
  }

  private evaluateChanges(next: ChannelSettings | null): void {
    if (!next || !this.originalSettings) {
      this.hasChanges.set(false);
      return;
    }
    const hasNewLogoFile = this.selectedLogoFile() !== null;
    this.hasChanges.set(hasNewLogoFile || !this.areSettingsEqual(next, this.originalSettings));
  }

  toggleCashierFlow(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.settingsState.update((settings) => {
      if (!settings) return settings;
      return { ...settings, cashierFlowEnabled: target.checked };
    });
    this.evaluateChanges(this.settingsState());
  }

  togglePrinter(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.settingsState.update((settings) => {
      if (!settings) return settings;
      return { ...settings, enablePrinter: target.checked };
    });
    this.evaluateChanges(this.settingsState());
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
        this.hasChanges.set(true);
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
    this.logoPreview.set(null);
    this.selectedLogoFile.set(null);
    this.settingsState.update((settings) => {
      if (!settings) return settings;
      return { ...settings, companyLogoAsset: null };
    });
    this.evaluateChanges(this.settings());
  }

  async saveSettings(): Promise<void> {
    const currentSettings = this.settings();
    if (!currentSettings) return;

    let logoAssetId: string | null | undefined = undefined;
    const currentLogo = currentSettings.companyLogoAsset;
    const originalLogo = this.originalSettings?.companyLogoAsset;

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

    if (currentSettings.cashierFlowEnabled !== this.originalSettings?.cashierFlowEnabled) {
      await this.settingsService.updateCashierSettings(currentSettings.cashierFlowEnabled);
    }

    if (currentSettings.enablePrinter !== this.originalSettings?.enablePrinter) {
      await this.settingsService.updatePrinterSettings(currentSettings.enablePrinter);
    }

    if (!this.settingsService.error()) {
      this.selectedLogoFile.set(null);
      this.originalSettings = { ...currentSettings };
      this.evaluateChanges(this.settings());
    }
  }
}

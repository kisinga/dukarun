import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../core/entitlements.service';
import { imageExtension, resizeImage } from '../shared/ui/image.util';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { CompanySettingsStore } from './company-settings.store';
import type { CompanySettings } from './settings.service';

const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Component({
  selector: 'app-business-settings',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, FormFieldComponent],
  template: `
    @if (loading()) {
      <div class="card bg-base-100">
        <div class="card-body gap-3 p-4">
          <div class="skeleton h-6 w-40"></div>
          <div class="skeleton h-16 w-full"></div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="skeleton h-12 w-full"></div>
            <div class="skeleton h-12 w-full"></div>
            <div class="skeleton h-12 w-full"></div>
            <div class="skeleton h-20 w-full sm:col-span-2"></div>
          </div>
        </div>
      </div>
    } @else if (loadError()) {
      <div class="card bg-base-100">
        <div class="card-body gap-3 p-4">
          <h2 class="section-title">Profile</h2>
          <p class="text-sm text-error">{{ loadError() }}</p>
          <button
            appButton
            variant="outline"
            size="sm"
            type="button"
            class="w-fit"
            (click)="load()"
          >
            Retry
          </button>
        </div>
      </div>
    } @else {
      <div class="card bg-base-100">
        <div class="card-body p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="section-title">Profile</h2>
              <p class="type-caption mt-1">Business identity used on receipts and documents.</p>
            </div>
            @if (dirty()) {
              <span class="badge badge-warning badge-sm">Unsaved changes</span>
            }
          </div>

          <div class="mt-3 flex items-center gap-3">
            @if (logoUrl(); as url) {
              <img
                [src]="url"
                alt="Company logo"
                class="h-14 w-14 rounded-box border border-base-300 object-contain"
              />
            } @else {
              <div
                class="flex h-14 w-14 items-center justify-center rounded-box border border-dashed border-base-300 bg-base-200 text-lg font-semibold text-base-content/50"
                aria-hidden="true"
              >
                {{ logoInitials() }}
              </div>
            }
            <div class="flex flex-wrap items-center gap-2">
              <button
                appButton
                variant="outline"
                size="sm"
                type="button"
                [loading]="logoBusy()"
                (click)="logoInput.click()"
              >
                {{ logoUrl() ? 'Change logo' : 'Upload logo' }}
              </button>
              @if (logoUrl()) {
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  [disabled]="logoBusy()"
                  (click)="removeLogo()"
                >
                  Remove logo
                </button>
              }
              <input
                #logoInput
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                class="hidden"
                (change)="onLogoSelected($event)"
              />
            </div>
          </div>
          <p class="type-caption mt-1">
            JPEG, PNG, WebP or SVG up to 2 MB. Shown on receipts and invoices.
          </p>
          @if (logoMessage(); as message) {
            <p
              class="mt-1 text-sm"
              [class.text-success]="message.ok"
              [class.text-error]="!message.ok"
            >
              {{ message.text }}
            </p>
          }

          <form (submit)="$event.preventDefault(); save()" class="mt-3 grid gap-3 sm:grid-cols-2">
            <app-form-field label="Company name" [required]="true">
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                [formControl]="name"
              />
            </app-form-field>
            <app-form-field
              label="Public slug"
              hint="Lowercase letters, numbers, and single hyphens only."
              [error]="slug.invalid && slug.touched ? 'Enter a valid public slug.' : null"
            >
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                [formControl]="slug"
                maxlength="63"
                autocapitalize="none"
                autocomplete="off"
                spellcheck="false"
              />
            </app-form-field>
            <app-form-field label="Business email">
              <input
                type="email"
                class="input input-bordered input-sm w-full"
                [formControl]="email"
              />
            </app-form-field>
            <app-form-field label="WhatsApp number (storefront)">
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                placeholder="+254..."
                [formControl]="whatsapp"
              />
            </app-form-field>
            <app-form-field label="Business address" class="sm:col-span-2">
              <textarea
                rows="2"
                class="textarea textarea-bordered textarea-sm w-full"
                [formControl]="address"
              ></textarea>
            </app-form-field>

            <div class="rounded-box border border-base-300/70 bg-base-200/30 p-3 sm:col-span-2">
              <label class="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span class="block text-sm font-medium">Public storefront enabled</span>
                  <span class="block text-xs text-base-content/60">
                    Storefront fields are used by your public storefront once publishing is
                    available.
                  </span>
                </span>
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  [formControl]="storefrontEnabled"
                  [attr.disabled]="!storefrontAvailable() ? '' : null"
                />
              </label>
              @if (!storefrontAvailable()) {
                <p class="type-caption mt-2 text-warning">
                  Storefront publishing is unavailable on this plan.
                  <a routerLink="/settings" [queryParams]="{ tab: 'billing' }" class="link">
                    View plans
                  </a>
                </p>
              }
            </div>

            <div class="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
              @if (dirty()) {
                <button
                  appButton
                  variant="ghost"
                  type="button"
                  [disabled]="busy()"
                  (click)="discard()"
                >
                  Discard
                </button>
                <button appButton type="submit" [loading]="busy()">Save changes</button>
              }
            </div>
          </form>
          @if (message(); as message) {
            <p
              class="mt-2 text-sm"
              [class.text-success]="message.ok"
              [class.text-error]="!message.ok"
            >
              {{ message.text }}
            </p>
          }
        </div>
      </div>
    }
  `,
})
export class BusinessSettingsComponent implements OnInit {
  private readonly companySettings = inject(CompanySettingsStore);
  protected readonly entitlements = inject(EntitlementsService);

  protected readonly loading = this.companySettings.loading;
  protected readonly loadError = this.companySettings.error;
  protected readonly settings = this.companySettings.settings;
  protected readonly busy = signal(false);
  protected readonly logoBusy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly logoMessage = signal<{ ok: boolean; text: string } | null>(null);

  protected readonly name = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly slug = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(63), Validators.pattern(PUBLIC_SLUG_PATTERN)],
  });
  protected readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email],
  });
  protected readonly whatsapp = new FormControl('', { nonNullable: true });
  protected readonly address = new FormControl('', { nonNullable: true });
  protected readonly storefrontEnabled = new FormControl(false, { nonNullable: true });

  protected readonly logoUrl = computed(() => {
    const logoPath = this.settings()?.logo_path;
    return logoPath ? this.companySettings.logoPublicUrl(logoPath) : null;
  });
  protected readonly storefrontAvailable = computed(() => this.entitlements.enabled('storefront'));

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      const [settings] = await Promise.all([
        this.companySettings.load(),
        this.entitlements.refresh(),
      ]);
      this.applySettings(settings);
    } catch {
      // The store owns the visible load error.
    }
  }

  protected discard(): void {
    const current = this.settings();
    if (!current) return;
    this.applySettings(current);
    this.message.set(null);
  }

  protected dirty(): boolean {
    return this.profileControls().some(control => control.dirty);
  }

  protected logoInitials(): string {
    return (
      this.name.value
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word[0]?.toUpperCase() ?? '')
        .join('') || 'B'
    );
  }

  protected async save(): Promise<void> {
    this.slug.setValue(this.slug.value.trim().toLowerCase());
    if (this.name.value.trim().length === 0) {
      this.message.set({ ok: false, text: 'Company name is required' });
      return;
    }
    if (this.email.invalid) {
      this.message.set({ ok: false, text: 'Enter a valid business email' });
      return;
    }
    if (this.slug.invalid) {
      this.slug.markAsTouched();
      this.message.set({
        ok: false,
        text: 'Public slug may contain only lowercase letters, numbers, and single hyphens.',
      });
      return;
    }
    this.busy.set(true);
    this.message.set(null);
    try {
      const settings = await this.companySettings.update({
        name: this.name.value.trim(),
        public_slug: this.slug.value || null,
        public_whatsapp_number: this.whatsapp.value.trim() || null,
        address: this.address.value.trim() || null,
        email: this.email.value.trim() || null,
        public_storefront_enabled: this.storefrontEnabled.value,
      });
      this.applySettings(settings);
      this.message.set({ ok: true, text: 'Saved' });
    } catch (error) {
      this.message.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Save failed',
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.logoMessage.set({ ok: false, text: 'Logo must be 2 MB or smaller' });
      return;
    }
    this.logoBusy.set(true);
    this.logoMessage.set(null);
    try {
      const isSvg = file.type === 'image/svg+xml';
      const ext = isSvg ? 'svg' : imageExtension(file);
      const blob = isSvg ? file : await resizeImage(file, 400);
      await this.companySettings.uploadLogo(blob, ext);
      this.logoMessage.set({ ok: true, text: 'Logo updated' });
    } catch (error) {
      this.logoMessage.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Upload failed',
      });
    } finally {
      this.logoBusy.set(false);
    }
  }

  protected async removeLogo(): Promise<void> {
    this.logoBusy.set(true);
    this.logoMessage.set(null);
    try {
      await this.companySettings.removeLogo();
      this.logoMessage.set({ ok: true, text: 'Logo removed' });
    } catch (error) {
      this.logoMessage.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Remove failed',
      });
    } finally {
      this.logoBusy.set(false);
    }
  }

  private applySettings(settings: CompanySettings): void {
    this.name.setValue(settings.name);
    this.slug.setValue(settings.public_slug ?? '');
    this.email.setValue(settings.email ?? '');
    this.whatsapp.setValue(settings.public_whatsapp_number ?? '');
    this.address.setValue(settings.address ?? '');
    this.storefrontEnabled.setValue(settings.public_storefront_enabled);
    for (const control of this.profileControls()) {
      control.markAsPristine();
    }
  }

  private profileControls(): Array<FormControl<string> | FormControl<boolean>> {
    return [this.name, this.slug, this.email, this.whatsapp, this.address, this.storefrontEnabled];
  }
}

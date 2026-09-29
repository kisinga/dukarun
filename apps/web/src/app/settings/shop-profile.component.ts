import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CompanySettingsStore } from './company-settings.store';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { imageExtension, resizeImage } from '../shared/ui/image.util';

/** The same saved identity form is used in Business settings and first setup. */
@Component({
  selector: 'app-shop-profile',
  imports: [ReactiveFormsModule, ButtonComponent, FormFieldComponent],
  template: `
    <section class="card bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title">Shop identity</h2>
        @if (dirty()) {
          <span class="type-caption">Unsaved changes</span>
        }
        <p class="type-caption">
          Used on your documents and public shop. Contact details below are customer-facing.
        </p>
        @if (loading()) {
          <p role="status">Loading shop details…</p>
        } @else if (loadError()) {
          <p role="alert" class="text-error">{{ loadError() }}</p>
          <button appButton variant="outline" (click)="load()">Retry</button>
        } @else {
          <div class="flex flex-wrap items-center gap-3">
            @if (logoUrl(); as url) {
              <img [src]="url" alt="Shop logo" class="h-14 w-14 object-contain" />
            }
            <button
              appButton
              variant="outline"
              type="button"
              [disabled]="busy() || logoBusy()"
              (click)="logoInput.click()"
            >
              {{ logoUrl() ? 'Change logo' : 'Upload logo' }}
            </button>
            @if (logoUrl()) {
              <button
                appButton
                variant="ghost"
                type="button"
                [disabled]="logoBusy() || busy()"
                (click)="removeLogo()"
              >
                Remove logo
              </button>
            }
            <input
              #logoInput
              type="file"
              class="hidden"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              (change)="selectLogo($event)"
            />
          </div>
          <p class="type-caption">
            Optional. JPEG, PNG, WebP or SVG, up to 2 MB. Your business name is used when no logo is
            uploaded.
          </p>
          @if (logoError()) {
            <p role="alert" class="text-error">{{ logoError() }}</p>
            @if (pendingLogo) {
              <button appButton variant="outline" [loading]="logoBusy()" (click)="uploadLogo()">
                Retry upload
              </button>
            }
          }
          <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); save()">
            <app-form-field label="Business name" [required]="true"
              ><input class="input input-bordered w-full" [formControl]="name" maxlength="200"
            /></app-form-field>
            <app-form-field label="Business email" hint="Shown to customers"
              ><input type="email" class="input input-bordered w-full" [formControl]="email"
            /></app-form-field>
            <app-form-field label="Public contact number" hint="Use a number customers can contact"
              ><input type="tel" class="input input-bordered w-full" [formControl]="phone"
            /></app-form-field>
            <app-form-field label="Website (optional)"
              ><input
                type="url"
                class="input input-bordered w-full"
                placeholder="https://example.com"
                [formControl]="website"
                maxlength="2048"
            /></app-form-field>
            <app-form-field label="Business address" class="sm:col-span-2">
              <textarea
                class="textarea textarea-bordered w-full"
                rows="2"
                [formControl]="address"
              ></textarea>
            </app-form-field>
            @if (error()) {
              <p role="alert" class="text-error sm:col-span-2">{{ error() }}</p>
            }
            @if (notice()) {
              <p role="status" class="text-success sm:col-span-2">{{ notice() }}</p>
            }
            <div class="flex flex-wrap justify-end gap-2 sm:col-span-2">
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
              }
              <button appButton type="submit" [loading]="busy()" [disabled]="logoBusy()">
                {{ saveLabel() }}
              </button>
            </div>
          </form>
        }
      </div>
    </section>
  `,
})
export class ShopProfileComponent implements OnInit {
  readonly saveLabel = input('Save shop details');
  readonly saved = output<void>();
  private readonly store = inject(CompanySettingsStore);
  readonly name = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly email = new FormControl('', { nonNullable: true, validators: [Validators.email] });
  readonly phone = new FormControl('', { nonNullable: true });
  readonly website = new FormControl('', { nonNullable: true });
  readonly address = new FormControl('', { nonNullable: true });
  readonly busy = signal(false);
  readonly logoBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly logoError = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly loading = this.store.loading;
  readonly loadError = this.store.error;
  readonly logoUrl = computed(() => {
    const path = this.store.settings()?.logo_path;
    return path ? this.store.logoPublicUrl(path) : null;
  });
  pendingLogo: File | null = null;
  async ngOnInit(): Promise<void> {
    await this.load();
  }
  async load(): Promise<void> {
    try {
      await this.store.load();
      this.discard();
    } catch {
      /* Store owns load error. */
    }
  }
  dirty(): boolean {
    return [this.name, this.email, this.phone, this.website, this.address].some(c => c.dirty);
  }
  discard(): void {
    const s = this.store.settings();
    if (!s) return;
    this.name.reset(s.name);
    this.email.reset(s.email ?? '');
    this.phone.reset(s.public_whatsapp_number ?? '');
    this.website.reset(s.website_url ?? '');
    this.address.reset(s.address ?? '');
    this.error.set(null);
    this.notice.set(null);
  }
  async save(): Promise<void> {
    if (this.busy() || this.logoBusy()) return;
    this.error.set(null);
    this.notice.set(null);
    if (!this.name.value.trim() || this.email.invalid) {
      this.error.set('Enter a business name and a valid email, or leave email empty.');
      return;
    }
    const website = this.website.value.trim();
    if (website) {
      try {
        const url = new URL(website);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw new Error();
      } catch {
        this.error.set('Enter a website beginning with https:// or http://.');
        return;
      }
    }
    this.busy.set(true);
    try {
      await this.store.update({
        name: this.name.value.trim(),
        email: this.email.value.trim() || null,
        address: this.address.value.trim() || null,
        public_whatsapp_number: this.phone.value.trim() || null,
        website_url: website || null,
      });
      this.discard();
      this.notice.set('Shop details saved.');
      this.saved.emit();
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : 'Save failed. Your entries are still here; try again.'
      );
    } finally {
      this.busy.set(false);
    }
  }
  async selectLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (
      file.size > 2 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)
    ) {
      this.logoError.set('Choose a JPEG, PNG, WebP or SVG of 2 MB or smaller.');
      return;
    }
    this.pendingLogo = file;
    await this.uploadLogo();
  }
  async uploadLogo(): Promise<void> {
    const file = this.pendingLogo;
    if (!file || this.logoBusy()) return;
    this.logoBusy.set(true);
    this.logoError.set(null);
    try {
      const svg = file.type === 'image/svg+xml';
      await this.store.uploadLogo(
        svg ? file : await resizeImage(file, 400),
        svg ? 'svg' : imageExtension(file)
      );
      this.pendingLogo = null;
    } catch (e) {
      this.logoError.set(
        e instanceof Error ? e.message : 'Upload failed. Retry to upload the same file.'
      );
    } finally {
      this.logoBusy.set(false);
    }
  }
  async removeLogo(): Promise<void> {
    this.logoBusy.set(true);
    this.logoError.set(null);
    try {
      await this.store.removeLogo();
    } catch (e) {
      this.logoError.set(e instanceof Error ? e.message : 'Logo could not be removed.');
    } finally {
      this.logoBusy.set(false);
    }
  }
}

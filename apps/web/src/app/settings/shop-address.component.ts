import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { shopWebUrl, suggestShopAddress } from '@dukarun/documents';
import { environment } from '../../environments/environment';
import { EntitlementsService } from '../core/entitlements.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { CompanySettingsStore } from './company-settings.store';
import { SettingsService } from './settings.service';

@Component({
  selector: 'app-shop-address',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, FormFieldComponent],
  template: `
    <section class="card bg-base-100">
      <div class="card-body p-4">
        <h2 class="section-title">Shop web address</h2>
        <p class="type-caption">
          Choose the address customers will use. Saving this address does not publish your shop.
        </p>
        <form class="space-y-3" (submit)="$event.preventDefault(); save()">
          <app-form-field
            label="Shop web address"
            hint="Lowercase letters, numbers and single hyphens"
          >
            <input
              class="input input-bordered w-full"
              [formControl]="slug"
              maxlength="63"
              autocapitalize="none"
              spellcheck="false"
              (blur)="check()"
            />
          </app-form-field>
          <p class="break-all text-sm">{{ fullUrl() }}</p>
          @if (feedback()) {
            <p role="status" class="text-sm">{{ feedback() }}</p>
          }
          @if (alternative()) {
            <button appButton variant="outline" type="button" (click)="useAlternative()">
              Use {{ alternative() }}
            </button>
          }
          @if (error()) {
            <p role="alert" class="text-error">{{ error() }}</p>
          }
          <div class="flex flex-wrap justify-end gap-2">
            @if (slug.dirty) {
              <button appButton variant="ghost" type="button" [disabled]="busy()" (click)="reset()">
                Discard
              </button>
            }
            <button appButton type="submit" [loading]="busy()">{{ saveLabel() }}</button>
          </div>
        </form>
        <div class="mt-3 border-t border-base-300 pt-3">
          <p class="text-sm font-medium">
            {{ published() ? 'Your storefront is published' : 'Your storefront is not published' }}
          </p>
          @if (published()) {
            <button appButton variant="outline" [disabled]="busy()" (click)="publish(false)">
              Unpublish storefront
            </button>
          } @else if (storefrontAvailable()) {
            <button
              appButton
              variant="outline"
              [disabled]="busy() || !settings()?.public_slug"
              (click)="publish(true)"
            >
              Publish storefront
            </button>
          } @else {
            <p class="type-caption">
              Storefront publishing is unavailable on this plan.
              <a class="link" routerLink="/settings" [queryParams]="{ tab: 'billing' }"
                >View plans</a
              >
            </p>
          }
        </div>
      </div>
    </section>
  `,
})
export class ShopAddressComponent implements OnInit {
  readonly saveLabel = input('Save web address');
  readonly saved = output<void>();
  private readonly store = inject(CompanySettingsStore);
  private readonly service = inject(SettingsService);
  private readonly entitlements = inject(EntitlementsService);
  readonly settings = this.store.settings;
  readonly slug = new FormControl('', { nonNullable: true });
  private readonly slugValue = toSignal(this.slug.valueChanges, { initialValue: '' });
  readonly fullUrl = computed(() =>
    shopWebUrl(environment.storefrontPublicUrl, this.slugValue().trim())
  );
  readonly busy = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly alternative = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly published = computed(() => this.settings()?.public_storefront_enabled ?? false);
  readonly storefrontAvailable = computed(() => this.entitlements.enabled('storefront'));
  private checkSequence = 0;
  async ngOnInit(): Promise<void> {
    try {
      await this.store.load();
      this.reset();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Shop details could not be loaded.');
    }
    void this.entitlements.refresh().catch(() => undefined);
  }
  reset(): void {
    this.slug.reset(
      this.settings()?.public_slug ?? suggestShopAddress(this.settings()?.name ?? '')
    );
    this.error.set(null);
    this.feedback.set(null);
    this.alternative.set(null);
  }
  useAlternative(): void {
    const alternative = this.alternative();
    if (alternative) {
      this.slug.setValue(alternative);
      this.slug.markAsDirty();
      this.alternative.set(null);
      this.feedback.set('Review this address, then save to confirm it.');
    }
  }
  private valid(slug: string): boolean {
    return slug.length <= 63 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
  }
  async check(): Promise<boolean> {
    const value = this.slug.value.trim().toLowerCase();
    const sequence = ++this.checkSequence;
    this.alternative.set(null);
    this.feedback.set(null);
    if (!this.valid(value)) {
      this.error.set('Use 1–63 lowercase letters, numbers and single hyphens.');
      return false;
    }
    this.error.set(null);
    try {
      const result = await this.service.shopAddressAvailability(value);
      if (sequence !== this.checkSequence || value !== this.slug.value.trim().toLowerCase())
        return false;
      this.feedback.set(
        result.available ? 'This address is available.' : 'That address is already in use.'
      );
      this.alternative.set(result.available ? null : result.suggestion);
      return result.available;
    } catch (e) {
      if (sequence === this.checkSequence)
        this.error.set(
          e instanceof Error ? e.message : 'Availability could not be checked. Try again.'
        );
      return false;
    }
  }
  async save(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      if (!(await this.check())) return;
      await this.store.update({ public_slug: this.slug.value.trim().toLowerCase() });
      this.slug.markAsPristine();
      this.feedback.set('Web address saved.');
      this.saved.emit();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed. Try again.';
      if (/unique|duplicate|public_slug/i.test(message)) {
        await this.check();
        this.error.set(
          'Another shop just took this address. Choose the suggested alternative and save again.'
        );
      } else this.error.set(message);
    } finally {
      this.busy.set(false);
    }
  }
  async publish(enabled: boolean): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.store.update({ public_storefront_enabled: enabled });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Publishing status could not be saved.');
    } finally {
      this.busy.set(false);
    }
  }
}

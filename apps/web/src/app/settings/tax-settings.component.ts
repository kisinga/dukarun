import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { TaxCategory } from '@dukarun/tax-types';
import { PermissionsService } from '../core/permissions.service';
import {
  TaxService,
  type CompanyTaxSettings,
  type TaxIntegrationLocation,
  type TaxJurisdiction,
} from '../core/tax.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ReceiptDataService } from '../shared/print/receipt-data.service';

@Component({
  selector: 'app-tax-settings',
  imports: [ReactiveFormsModule, ButtonComponent, FormFieldComponent, IconComponent],
  template: `
    <div class="card bg-base-100">
      <div class="card-body p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="section-title">VAT</h2>
            <p class="type-caption mt-1">
              Prices remain the amount customers pay. VAT is extracted from that amount and never
              added at checkout.
            </p>
          </div>
          @if (settings()?.active_profile; as profile) {
            <span class="badge" [class.badge-success]="profile.vat_registered">
              {{ profile.vat_registered ? 'VAT registered' : 'Not VAT registered' }}
            </span>
          }
        </div>

        @if (loading()) {
          <p class="type-caption mt-4">Loading VAT settings…</p>
        } @else if (error()) {
          <div role="alert" class="alert alert-error mt-4 text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ error() }}</span>
          </div>
        } @else if (settings(); as current) {
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div class="rounded-box border border-base-300 p-3">
              <p class="type-caption">Current treatment</p>
              <p class="mt-1 font-semibold">
                {{ current.active_profile?.jurisdiction_name ?? 'Not configured' }}
              </p>
              @if (current.active_profile?.vat_registered) {
                <p class="type-caption mt-1">
                  PIN {{ current.active_profile?.tax_registration_number }} · effective
                  {{ current.active_profile?.effective_from }}
                </p>
              }
            </div>
            <label
              class="flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-box border border-base-300 p-3"
            >
              <span>
                <span class="block text-sm font-semibold">Show VAT breakdown on prints</span>
                <span class="type-caption">One shop-wide setting for receipts and invoices.</span>
              </span>
              <input
                type="checkbox"
                class="toggle toggle-primary"
                [checked]="current.show_vat_breakdown_on_prints"
                [disabled]="savingPrint() || !canManage()"
                (change)="savePrint($event)"
              />
            </label>
          </div>

          @if (kenyaVatConfigured()) {
            <section class="mt-4 rounded-box border border-base-300 p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold">eTIMS preparation</h3>
                  <p class="type-caption mt-1">
                    Save the KRA branch ID assigned to each location. Future VAT documents snapshot
                    it, so an eTIMS connector can submit them without changing historical sales.
                  </p>
                </div>
                <span class="badge badge-outline">No submission yet</span>
              </div>
              <div class="mt-3 grid gap-2">
                @for (location of integrationLocations(); track location.id) {
                  <div class="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
                    <div>
                      <p class="text-sm font-medium">{{ location.name }}</p>
                      <p class="type-caption">{{ location.code }}</p>
                    </div>
                    <app-form-field
                      label="KRA branch ID"
                      hint="Use the ID assigned by KRA, often 00 for head office."
                    >
                      <input
                        class="input input-bordered input-sm w-full"
                        autocomplete="off"
                        maxlength="32"
                        [value]="branchCodes()[location.id]"
                        [disabled]="!canManage() || savingBranchId() === location.id"
                        (input)="setBranchCode(location.id, $event)"
                      />
                    </app-form-field>
                    <button
                      appButton
                      type="button"
                      variant="outline"
                      [loading]="savingBranchId() === location.id"
                      [disabled]="!canManage()"
                      (click)="saveBranchCode(location)"
                    >
                      Save
                    </button>
                  </div>
                } @empty {
                  <p class="type-caption">No active shop locations found.</p>
                }
              </div>
              <p class="type-caption mt-3">
                This prepares document data only. Dukarun does not yet sign, transmit, or certify
                invoices through eTIMS.
              </p>
            </section>
          }

          @if (current.scheduled_profiles.length) {
            <div class="mt-4 rounded-box border border-info/30 bg-info/5 p-3">
              <p class="text-sm font-semibold">Scheduled changes</p>
              <div class="mt-2 grid gap-2">
                @for (profile of current.scheduled_profiles; track profile.id) {
                  <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {{ profile.jurisdiction_name }} ·
                      {{ profile.vat_registered ? 'VAT registered' : 'Not VAT registered' }}
                    </span>
                    <div class="flex items-center gap-2">
                      <span class="badge badge-info badge-outline"
                        >Starts {{ profile.effective_from }}</span
                      >
                      @if (canManage()) {
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs text-error"
                          [disabled]="saving()"
                          (click)="cancelScheduled(profile.id)"
                        >
                          Cancel
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          @if (canManage()) {
            <form
              class="mt-5 border-t border-base-300/70 pt-4"
              (submit)="$event.preventDefault(); saveProfile()"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold">Set up VAT</h3>
                  <p class="type-caption mt-1">Step {{ onboardingStep() }} of 4</p>
                </div>
                <ul class="steps steps-horizontal hidden text-xs sm:flex">
                  @for (step of [1, 2, 3, 4]; track step) {
                    <li class="step" [class.step-primary]="onboardingStep() >= step"></li>
                  }
                </ul>
              </div>
              <p class="type-caption mt-1">
                Prices stay gross: enabling VAT extracts tax from the selling price and never adds
                it at checkout. Historical transactions never change.
              </p>
              <div class="mt-4 min-h-40 rounded-box border border-base-300 p-4">
                @if (onboardingStep() === 1) {
                  <h4 class="font-semibold">Is this shop VAT registered?</h4>
                  <p class="type-caption mt-1">
                    Choose no when recording a deregistration or keeping VAT disabled.
                  </p>
                  <div class="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      class="btn"
                      [class.btn-primary]="registered.value"
                      (click)="registered.setValue(true)"
                    >
                      Yes, VAT registered
                    </button>
                    <button
                      type="button"
                      class="btn"
                      [class.btn-primary]="!registered.value"
                      (click)="registered.setValue(false)"
                    >
                      No, not registered
                    </button>
                  </div>
                } @else if (onboardingStep() === 2) {
                  <app-form-field
                    label="VAT country"
                    hint="Only reviewed, published country packages are shown."
                    [required]="true"
                  >
                    <select
                      class="select select-bordered w-full"
                      [formControl]="jurisdiction"
                      (change)="jurisdictionChanged()"
                    >
                      @for (item of current.jurisdictions; track item.id) {
                        <option [value]="item.id">{{ item.name }} ({{ item.country_code }})</option>
                      }
                    </select>
                  </app-form-field>
                  <p class="mt-3 text-sm">
                    The standard country treatment is selected automatically. Product exceptions can
                    be set in the catalog.
                  </p>
                } @else if (onboardingStep() === 3) {
                  <div class="grid gap-3 sm:grid-cols-2">
                    @if (registered.value) {
                      <app-form-field label="VAT registration PIN" [required]="true">
                        <input
                          class="input input-bordered w-full"
                          autocomplete="off"
                          [formControl]="pin"
                        />
                      </app-form-field>
                    }
                    <app-form-field
                      label="First taxable business date"
                      [hint]="
                        current.activation.has_financial_activity_today
                          ? 'Today already has finalized activity, so the earliest safe date is tomorrow.'
                          : 'Today is available because no financial activity has finalized yet.'
                      "
                      [required]="true"
                    >
                      <input
                        type="date"
                        class="input input-bordered w-full"
                        [min]="current.activation.earliest_effective_from"
                        [formControl]="effectiveFrom"
                      />
                    </app-form-field>
                  </div>
                } @else {
                  <h4 class="font-semibold">Review</h4>
                  <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt class="type-caption">Status</dt>
                      <dd class="font-medium">
                        {{ registered.value ? 'VAT registered' : 'Not VAT registered' }}
                      </dd>
                    </div>
                    <div>
                      <dt class="type-caption">Country</dt>
                      <dd class="font-medium">{{ jurisdictionName() }}</dd>
                    </div>
                    <div>
                      <dt class="type-caption">First business date</dt>
                      <dd class="font-medium">{{ effectiveFrom.value }}</dd>
                    </div>
                    <div>
                      <dt class="type-caption">Default treatment</dt>
                      <dd class="font-medium">{{ defaultCategoryName() }}</dd>
                    </div>
                  </dl>
                  <div class="alert alert-info mt-4 text-sm">
                    Selling prices remain unchanged. VAT is extracted at the transaction tax point;
                    accounting-period closing is separate.
                  </div>
                }
              </div>
              @if (notice()) {
                <p class="mt-3 text-sm text-success">{{ notice() }}</p>
              }
              <div class="mt-4 flex justify-between gap-2">
                <button
                  type="button"
                  class="btn btn-ghost"
                  [disabled]="onboardingStep() === 1"
                  (click)="previousStep()"
                >
                  Back
                </button>
                @if (onboardingStep() < 4) {
                  <button type="button" class="btn btn-primary" (click)="nextStep()">
                    Continue
                  </button>
                } @else {
                  <button appButton type="submit" [loading]="saving()">
                    {{
                      effectiveFrom.value === current.activation.business_date
                        ? 'Activate now'
                        : 'Schedule VAT'
                    }}
                  </button>
                }
              </div>
            </form>
          } @else {
            <p class="type-caption mt-4 border-t border-base-300/70 pt-4">
              Finance administration permission is required to change VAT settings.
            </p>
          }
        }
      </div>
    </div>
  `,
})
export class TaxSettingsComponent implements OnInit {
  private readonly tax = inject(TaxService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly permissions = inject(PermissionsService);

  protected readonly settings = signal<CompanyTaxSettings | null>(null);
  protected readonly categories = signal<TaxCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly savingPrint = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly integrationLocations = signal<TaxIntegrationLocation[]>([]);
  protected readonly branchCodes = signal<Record<string, string>>({});
  protected readonly savingBranchId = signal<string | null>(null);
  protected readonly onboardingStep = signal(1);
  protected readonly canManage = computed(() => this.permissions.has('CloseAccountingPeriod'));
  protected readonly kenyaVatConfigured = computed(() => {
    const current = this.settings();
    return Boolean(
      (current?.active_profile?.vat_registered && current.active_profile.country_code === 'KE') ||
      current?.scheduled_profiles.some(
        profile => profile.vat_registered && profile.country_code === 'KE'
      )
    );
  });
  protected readonly defaultCategoryName = computed(
    () =>
      this.categories().find(item => item.id === this.defaultCategory.value)?.name ??
      'Country default'
  );

  protected readonly jurisdiction = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly effectiveFrom = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly registered = new FormControl(false, { nonNullable: true });
  protected readonly pin = new FormControl('', { nonNullable: true });
  protected readonly defaultCategory = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async jurisdictionChanged(): Promise<void> {
    const id = this.jurisdiction.value;
    if (!id) return;
    try {
      const categories = await this.tax.categories(id);
      this.categories.set(categories);
      this.defaultCategory.setValue(
        categories.find(item => item.is_default)?.id ?? categories[0]?.id ?? ''
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load tax categories');
    }
  }

  protected async savePrint(event: Event): Promise<void> {
    this.savingPrint.set(true);
    this.error.set(null);
    try {
      const show = (event.target as HTMLInputElement).checked;
      await this.tax.updatePrintVisibility(show);
      this.receiptData.invalidateCompanyInfo();
      this.settings.update(value =>
        value ? { ...value, show_vat_breakdown_on_prints: show } : value
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not update print settings');
      await this.load();
    } finally {
      this.savingPrint.set(false);
    }
  }

  protected async saveProfile(): Promise<void> {
    if (this.jurisdiction.invalid || this.effectiveFrom.invalid || this.defaultCategory.invalid)
      return;
    if (this.registered.value && !this.pin.value.trim()) {
      this.error.set('Enter the shop tax registration PIN.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.tax.scheduleProfile({
        jurisdictionId: this.jurisdiction.value,
        vatRegistered: this.registered.value,
        taxRegistrationNumber: this.registered.value ? this.pin.value.trim() : null,
        effectiveFrom: this.effectiveFrom.value,
        defaultTaxCategoryId: this.defaultCategory.value,
      });
      this.receiptData.invalidateCompanyInfo();
      this.notice.set(`VAT treatment will start on ${this.effectiveFrom.value}.`);
      this.onboardingStep.set(1);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not schedule VAT treatment');
    } finally {
      this.saving.set(false);
    }
  }

  protected setBranchCode(locationId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.branchCodes.update(current => ({ ...current, [locationId]: value }));
  }

  protected async saveBranchCode(location: TaxIntegrationLocation): Promise<void> {
    this.savingBranchId.set(location.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      const branchCode = this.branchCodes()[location.id]?.trim() ?? '';
      await this.tax.updateLocationTaxBranchCode(location.id, branchCode);
      this.integrationLocations.update(locations =>
        locations.map(item =>
          item.id === location.id
            ? { ...item, tax_integration_branch_code: branchCode || null }
            : item
        )
      );
      this.notice.set(`Saved the tax branch ID for ${location.name}.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save tax branch ID');
    } finally {
      this.savingBranchId.set(null);
    }
  }

  protected nextStep(): void {
    if (this.onboardingStep() === 2 && !this.jurisdiction.value) return;
    if (
      this.onboardingStep() === 3 &&
      (!this.effectiveFrom.value || (this.registered.value && !this.pin.value.trim()))
    )
      return;
    this.onboardingStep.update(step => Math.min(step + 1, 4));
  }

  protected previousStep(): void {
    this.onboardingStep.update(step => Math.max(step - 1, 1));
  }

  protected jurisdictionName(): string {
    return (
      this.settings()?.jurisdictions.find(item => item.id === this.jurisdiction.value)?.name ??
      'Not selected'
    );
  }

  protected async cancelScheduled(profileId: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.tax.cancelScheduledProfile(profileId);
      this.notice.set('Scheduled VAT change cancelled.');
      await this.load();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Could not cancel scheduled VAT change'
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [settings, locations] = await Promise.all([
        this.tax.settings(),
        this.tax.integrationLocations(),
      ]);
      this.settings.set(settings);
      this.integrationLocations.set(locations);
      this.branchCodes.set(
        Object.fromEntries(
          locations.map(location => [location.id, location.tax_integration_branch_code ?? ''])
        )
      );
      this.effectiveFrom.setValue(settings.activation.earliest_effective_from);
      const profile = settings.active_profile;
      const jurisdictionId = profile?.jurisdiction_id ?? settings.jurisdictions[0]?.id ?? '';
      this.jurisdiction.setValue(jurisdictionId);
      this.registered.setValue(profile?.vat_registered ?? false);
      this.pin.setValue(profile?.tax_registration_number ?? '');
      this.categories.set(jurisdictionId ? await this.tax.categories(jurisdictionId) : []);
      this.defaultCategory.setValue(
        profile?.default_tax_category_id ??
          this.categories().find(item => item.is_default)?.id ??
          this.categories()[0]?.id ??
          ''
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not load VAT settings');
    } finally {
      this.loading.set(false);
    }
  }
}

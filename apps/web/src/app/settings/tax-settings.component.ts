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
              Control how Dukarun calculates and reports VAT. Enabling it does not register the
              business with a tax authority.
            </p>
          </div>
          @if (settings(); as current) {
            @if (current.active_profile?.vat_registered) {
              <span class="badge badge-success">VAT on</span>
            } @else if (scheduledVatActivation()) {
              <span class="badge badge-info badge-outline">VAT scheduled</span>
            } @else {
              <span class="badge badge-ghost">VAT off</span>
            }
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
          <div class="mt-4 rounded-box border border-base-300 p-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                @if (current.active_profile?.vat_registered) {
                  <p class="text-sm font-semibold">VAT accounting is on</p>
                  <p class="type-caption mt-1">
                    {{ current.active_profile?.jurisdiction_name }} · on since
                    {{ current.active_profile?.effective_from }} · prices remain VAT-inclusive
                  </p>
                } @else if (scheduledVatActivation(); as scheduled) {
                  <p class="text-sm font-semibold">VAT activation is scheduled</p>
                  <p class="type-caption mt-1">
                    {{ scheduled.jurisdiction_name }} · starts {{ scheduled.effective_from }}
                  </p>
                } @else {
                  <p class="text-sm font-semibold">VAT is not active</p>
                  <p class="type-caption mt-1">
                    Sales are recorded without output VAT. Historical transactions are unchanged.
                  </p>
                }
              </div>
              @if (canManage() && !profileEditorOpen() && current.scheduled_profiles.length === 0) {
                <button
                  appButton
                  type="button"
                  variant="outline"
                  size="sm"
                  (click)="openEditor(!current.active_profile?.vat_registered)"
                >
                  {{ current.active_profile?.vat_registered ? 'Turn VAT off' : 'Turn VAT on' }}
                </button>
              }
            </div>

            @if (registrationProfile(); as profile) {
              <div class="mt-3 border-t border-base-300 pt-3">
                <div class="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <app-form-field
                    label="KRA PIN for invoices (optional)"
                    hint="Shown on printed tax documents and used by tax integrations. You can add or change it later."
                  >
                    <input
                      class="input input-bordered input-sm w-full"
                      autocomplete="off"
                      [formControl]="documentPin"
                      [disabled]="!canManage() || savingPin()"
                    />
                  </app-form-field>
                  <button
                    appButton
                    type="button"
                    variant="outline"
                    size="sm"
                    [loading]="savingPin()"
                    [disabled]="!canManage() || documentPin.pristine"
                    (click)="saveDocumentPin(profile.id)"
                  >
                    Save PIN
                  </button>
                </div>
                @if (!profile.tax_registration_number) {
                  <p class="mt-2 text-xs text-warning">
                    VAT calculations are on. Add a KRA PIN before issuing documents that must show
                    it.
                  </p>
                }
              </div>
            }

            @if (current.active_profile?.vat_registered || scheduledVatActivation()) {
              <label
                class="mt-3 flex cursor-pointer items-center justify-between gap-3 border-t border-base-300 pt-3"
              >
                <span>
                  <span class="block text-sm font-medium">Show VAT on printed documents</span>
                  <span class="type-caption">Applies to receipts, invoices, and reprints.</span>
                </span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-sm"
                  [checked]="current.show_vat_breakdown_on_prints"
                  [disabled]="savingPrint() || !canManage()"
                  (change)="savePrint($event)"
                />
              </label>
            }
          </div>

          @if (notice()) {
            <p class="mt-3 text-sm text-success">{{ notice() }}</p>
          }

          @if (kenyaVatConfigured()) {
            <details class="mt-4 rounded-box border border-base-300 p-3">
              <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold">eTIMS preparation</h3>
                  <p class="type-caption mt-1">
                    Optional branch identifiers for future integration.
                  </p>
                </div>
                <span class="badge badge-outline">No submission yet</span>
              </summary>
              <div class="mt-3 border-t border-base-300 pt-3">
                <p class="type-caption">
                  Future VAT documents snapshot the KRA branch ID saved for each location.
                </p>
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
                  Dukarun does not yet sign, transmit, or certify invoices through eTIMS.
                </p>
              </div>
            </details>
          }

          @if (current.scheduled_profiles.length) {
            <div class="mt-4 rounded-box border border-info/30 bg-info/5 p-3">
              <p class="text-sm font-semibold">Scheduled changes</p>
              <div class="mt-2 grid gap-2">
                @for (profile of current.scheduled_profiles; track profile.id) {
                  <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {{ profile.jurisdiction_name }} ·
                      {{ profile.vat_registered ? 'VAT will turn on' : 'VAT will turn off' }}
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

          @if (canManage() && profileEditorOpen()) {
            <form
              class="mt-4 rounded-box border border-primary/20 bg-base-200/40 p-4"
              (submit)="$event.preventDefault(); saveProfile()"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="font-semibold">
                    {{ registered.value ? 'Turn VAT accounting on' : 'Turn VAT accounting off' }}
                  </h3>
                  <p class="type-caption mt-1">
                    {{
                      registered.value
                        ? 'Choose when Dukarun should begin calculating and reporting VAT.'
                        : 'Choose when new sales should stop recording output VAT.'
                    }}
                  </p>
                </div>
                <button type="button" class="btn btn-ghost btn-sm" (click)="closeEditor()">
                  Cancel
                </button>
              </div>

              <div class="mt-4 grid gap-4" [class.sm:grid-cols-2]="registered.value">
                @if (registered.value) {
                  <app-form-field
                    label="Tax country"
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
                }

                <app-form-field
                  [label]="
                    registered.value ? 'First VAT business date' : 'First non-VAT business date'
                  "
                  [hint]="
                    current.activation.has_financial_activity_today
                      ? 'Today has finalized activity. The earliest safe date is tomorrow.'
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

                @if (registered.value) {
                  <app-form-field
                    label="KRA PIN for invoices (optional)"
                    hint="Used on tax documents and integrations. It does not control VAT calculation."
                  >
                    <input
                      class="input input-bordered w-full"
                      autocomplete="off"
                      [formControl]="pin"
                    />
                  </app-form-field>
                  <div class="rounded-box border border-base-300 bg-base-100 p-3 text-sm">
                    <p class="font-medium">{{ defaultCategoryName() }}</p>
                    <p class="type-caption mt-1">
                      Default country treatment. Product exceptions stay configurable in the
                      catalog.
                    </p>
                  </div>
                }
              </div>

              <div
                class="mt-4 rounded-box p-3 text-sm"
                [class.bg-info/10]="registered.value"
                [class.text-info-content]="registered.value"
                [class.bg-warning/10]="!registered.value"
              >
                {{
                  registered.value
                    ? 'Prices stay unchanged. Dukarun extracts VAT from them from the selected date. The business remains responsible for its tax obligations.'
                    : 'New sales from the selected date will not record output VAT. Historical transactions remain unchanged.'
                }}
              </div>

              <div class="mt-4 flex justify-end">
                <button appButton type="submit" [loading]="saving()">
                  {{
                    registered.value
                      ? effectiveFrom.value === current.activation.business_date
                        ? 'Turn on VAT now'
                        : 'Schedule VAT on'
                      : effectiveFrom.value === current.activation.business_date
                        ? 'Turn off VAT now'
                        : 'Schedule VAT off'
                  }}
                </button>
              </div>
            </form>
          } @else if (!canManage()) {
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
  protected readonly savingPin = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly integrationLocations = signal<TaxIntegrationLocation[]>([]);
  protected readonly branchCodes = signal<Record<string, string>>({});
  protected readonly savingBranchId = signal<string | null>(null);
  protected readonly profileEditorOpen = signal(false);
  protected readonly canManage = computed(() => this.permissions.has('CloseAccountingPeriod'));
  protected readonly scheduledVatActivation = computed(
    () => this.settings()?.scheduled_profiles.find(profile => profile.vat_registered) ?? null
  );
  protected readonly registrationProfile = computed(
    () =>
      (this.settings()?.active_profile?.vat_registered
        ? this.settings()?.active_profile
        : this.scheduledVatActivation()) ?? null
  );
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
  protected readonly documentPin = new FormControl('', { nonNullable: true });
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
      this.notice.set(
        this.registered.value
          ? `VAT accounting will turn on from ${this.effectiveFrom.value}.`
          : `VAT accounting will turn off from ${this.effectiveFrom.value}.`
      );
      this.profileEditorOpen.set(false);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not schedule VAT treatment');
    } finally {
      this.saving.set(false);
    }
  }

  protected async saveDocumentPin(profileId: string): Promise<void> {
    this.savingPin.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const value = this.documentPin.value.trim();
      await this.tax.updateRegistrationNumber(profileId, value || null);
      this.receiptData.invalidateCompanyInfo();
      this.documentPin.markAsPristine();
      this.notice.set(value ? 'KRA PIN saved for future tax documents.' : 'KRA PIN removed.');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not update the KRA PIN');
    } finally {
      this.savingPin.set(false);
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

  protected openEditor(enabled: boolean): void {
    this.notice.set(null);
    this.registered.setValue(enabled);
    this.profileEditorOpen.set(true);
  }

  protected closeEditor(): void {
    this.profileEditorOpen.set(false);
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
      const registrationProfile = profile?.vat_registered
        ? profile
        : settings.scheduled_profiles.find(item => item.vat_registered);
      this.documentPin.setValue(registrationProfile?.tax_registration_number ?? '');
      this.documentPin.markAsPristine();
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

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PlatformService, type PlatformTaxJurisdiction } from '../../core/platform.service';

@Component({
  selector: 'app-tax-catalog',
  imports: [ReactiveFormsModule],
  template: `
    <div class="mx-auto max-w-6xl">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="type-caption font-semibold uppercase tracking-wide">Financial governance</p>
          <h1 class="mt-1 text-2xl font-bold">VAT country packages</h1>
          <p class="mt-1 text-sm text-base-content/60">
            Build and validate a complete country package before shops can use it.
          </p>
        </div>
        <button class="btn btn-primary btn-sm" type="button" (click)="startCountry()">
          Add country
        </button>
      </div>
      @if (error()) {
        <div class="alert alert-error mb-4 text-sm">{{ error() }}</div>
      }
      @if (notice()) {
        <div class="alert alert-success mb-4 text-sm">{{ notice() }}</div>
      }

      <div class="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <aside class="rounded-box border border-base-300 bg-base-100 p-2">
          @for (item of catalog(); track item.id) {
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-btn px-3 py-3 text-left hover:bg-base-200"
              [class.bg-base-200]="selectedId() === item.id"
              (click)="selectPackage(item.id)"
            >
              <span
                ><strong class="block text-sm">{{ item.name }}</strong
                ><span class="type-caption"
                  >{{ item.country_code }} · {{ item.currency_code }}</span
                ></span
              >
              <span
                class="badge badge-sm"
                [class.badge-success]="item.status === 'published'"
                [class.badge-warning]="item.status === 'draft'"
                >{{ item.status }}</span
              >
            </button>
          } @empty {
            <p class="p-4 text-sm text-base-content/60">No country packages yet.</p>
          }
        </aside>

        <main>
          @if (addingCountry()) {
            <form
              class="rounded-box border border-base-300 bg-base-100 p-5"
              (submit)="$event.preventDefault(); saveCountry()"
            >
              <h2 class="font-semibold">1. Country details</h2>
              <p class="type-caption mt-1">
                The package remains private until readiness validation passes.
              </p>
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <label class="form-control"
                  ><span class="label-text mb-1">Country name</span
                  ><input class="input input-bordered" [formControl]="countryName"
                /></label>
                <label class="form-control"
                  ><span class="label-text mb-1">ISO country code</span
                  ><input
                    maxlength="2"
                    class="input input-bordered uppercase"
                    [formControl]="countryCode"
                /></label>
                <label class="form-control"
                  ><span class="label-text mb-1">Currency code</span
                  ><input
                    maxlength="3"
                    class="input input-bordered uppercase"
                    [formControl]="currencyCode"
                /></label>
                <label class="form-control"
                  ><span class="label-text mb-1">Business timezone</span
                  ><input
                    class="input input-bordered"
                    placeholder="Africa/Nairobi"
                    [formControl]="timezone"
                /></label>
              </div>
              <div class="mt-4 flex justify-end gap-2">
                <button class="btn btn-ghost" type="button" (click)="addingCountry.set(false)">
                  Cancel</button
                ><button class="btn btn-primary" type="submit" [disabled]="saving()">
                  Create draft
                </button>
              </div>
            </form>
          } @else if (selected(); as jurisdiction) {
            <section class="rounded-box border border-base-300 bg-base-100">
              <header class="border-b border-base-300 p-5">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 class="text-lg font-semibold">{{ jurisdiction.name }}</h2>
                    <p class="type-caption">
                      {{ jurisdiction.country_code }} · {{ jurisdiction.currency_code }} ·
                      {{ jurisdiction.default_timezone }}
                    </p>
                  </div>
                  <span
                    class="badge"
                    [class.badge-success]="jurisdiction.status === 'published'"
                    [class.badge-warning]="jurisdiction.status === 'draft'"
                    >{{ jurisdiction.status }}</span
                  >
                </div>
                <ul class="steps steps-horizontal mt-5 w-full text-xs">
                  <li class="step step-primary">Country</li>
                  <li class="step" [class.step-primary]="jurisdiction.categories.length > 0">
                    Treatments
                  </li>
                  <li class="step" [class.step-primary]="hasRates(jurisdiction)">Rates</li>
                  <li class="step" [class.step-primary]="jurisdiction.readiness.ready">Ready</li>
                  <li class="step" [class.step-primary]="jurisdiction.status === 'published'">
                    Published
                  </li>
                </ul>
              </header>

              <div class="p-5">
                <div
                  class="rounded-box border p-4"
                  [class.border-success]="jurisdiction.readiness.ready"
                  [class.border-warning]="!jurisdiction.readiness.ready"
                >
                  <div class="flex items-center justify-between gap-2">
                    <strong>Readiness check</strong
                    ><span class="badge" [class.badge-success]="jurisdiction.readiness.ready">{{
                      jurisdiction.readiness.ready ? 'Ready' : 'Needs attention'
                    }}</span>
                  </div>
                  @if (jurisdiction.readiness.blockers.length) {
                    <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
                      @for (blocker of jurisdiction.readiness.blockers; track blocker) {
                        <li>{{ blocker }}</li>
                      }
                    </ul>
                  }
                  @if (jurisdiction.status === 'draft') {
                    <button
                      class="btn btn-primary btn-sm mt-4"
                      type="button"
                      [disabled]="!jurisdiction.readiness.ready || saving()"
                      (click)="publishPackage(jurisdiction.id)"
                    >
                      Preview complete — publish package
                    </button>
                  }
                </div>

                <div class="mt-5 divide-y divide-base-300 rounded-box border border-base-300">
                  @for (category of jurisdiction.categories; track category.id) {
                    <article class="p-4">
                      <div class="flex flex-wrap items-center gap-2">
                        <strong>{{ category.name }}</strong
                        ><code class="text-xs">{{ category.code }}</code
                        ><span class="badge badge-ghost">{{ category.classification }}</span>
                        @if (category.is_default) {
                          <span class="badge badge-primary">Shop default</span>
                        }
                        @if (!category.active) {
                          <span class="badge badge-warning">Future draft</span>
                        }
                      </div>
                      <div class="mt-2 flex flex-wrap gap-2">
                        @for (rate of category.rates ?? []; track rate.id) {
                          <span class="badge badge-outline h-auto py-1"
                            >{{ rate.rate_bps / 100 }}% · {{ rate.effective_from
                            }}{{ rate.effective_to ? ' to ' + rate.effective_to : ' onward' }}</span
                          >
                        }
                        <button
                          class="btn btn-ghost btn-xs"
                          type="button"
                          (click)="selectCategory(category.id)"
                        >
                          Add rate
                        </button>
                        @if (jurisdiction.status === 'published' && !category.active) {
                          <button
                            class="btn btn-outline btn-xs"
                            type="button"
                            (click)="selectCategoryActivation(category.id)"
                          >
                            Schedule activation
                          </button>
                        }
                      </div>
                      @if (activationCategoryId() === category.id) {
                        <div
                          class="mt-3 flex flex-wrap items-end gap-2 rounded-box bg-base-200/60 p-3"
                        >
                          <label class="form-control"
                            ><span class="label-text mb-1">First usable date</span
                            ><input
                              type="date"
                              class="input input-bordered input-sm"
                              [formControl]="categoryEffectiveFrom"
                          /></label>
                          <button
                            class="btn btn-primary btn-sm"
                            type="button"
                            [disabled]="saving()"
                            (click)="publishCategory(category.id)"
                          >
                            Activate treatment
                          </button>
                          <button
                            class="btn btn-ghost btn-sm"
                            type="button"
                            (click)="activationCategoryId.set('')"
                          >
                            Cancel
                          </button>
                        </div>
                      }
                    </article>
                  } @empty {
                    <p class="p-4 text-sm text-base-content/60">
                      Add standard, zero-rated and exempt treatments.
                    </p>
                  }
                </div>

                <div class="mt-5 grid gap-4 lg:grid-cols-2">
                  @if (jurisdiction.status !== 'retired') {
                    <form
                      class="rounded-box border border-base-300 p-4"
                      (submit)="$event.preventDefault(); saveCategory()"
                    >
                      <h3 class="font-semibold">
                        {{
                          jurisdiction.status === 'draft'
                            ? '2. Add treatment'
                            : 'Add future treatment'
                        }}
                      </h3>
                      @if (jurisdiction.status === 'published') {
                        <p class="type-caption mt-1">
                          Creates an inactive treatment. Add its first rate, then schedule
                          activation.
                        </p>
                      }
                      <label class="form-control mt-3"
                        ><span class="label-text mb-1">Stable code</span
                        ><input class="input input-bordered input-sm" [formControl]="categoryCode"
                      /></label>
                      <label class="form-control mt-3"
                        ><span class="label-text mb-1">Display name</span
                        ><input class="input input-bordered input-sm" [formControl]="categoryName"
                      /></label>
                      <label class="form-control mt-3"
                        ><span class="label-text mb-1">Classification</span
                        ><select
                          class="select select-bordered select-sm"
                          [formControl]="classification"
                        >
                          <option value="standard">Standard</option>
                          <option value="special">Special</option>
                          <option value="zero_rated">Zero-rated</option>
                          <option value="exempt">Exempt</option>
                        </select></label
                      >
                      @if (jurisdiction.status === 'draft') {
                        <label class="mt-3 flex items-center gap-2 text-sm"
                          ><input
                            type="checkbox"
                            class="checkbox checkbox-sm"
                            [formControl]="isDefault"
                          />
                          Country shop default</label
                        >
                      }
                      <button
                        class="btn btn-outline btn-sm mt-4"
                        type="submit"
                        [disabled]="saving()"
                      >
                        Add treatment
                      </button>
                    </form>
                  }
                  <form
                    class="rounded-box border border-base-300 p-4"
                    (submit)="$event.preventDefault(); saveRate()"
                  >
                    <h3 class="font-semibold">
                      {{
                        jurisdiction.status === 'draft'
                          ? '3. Add effective rate'
                          : 'Add future rate version'
                      }}
                    </h3>
                    <label class="form-control mt-3"
                      ><span class="label-text mb-1">Treatment</span
                      ><select class="select select-bordered select-sm" [formControl]="categoryId">
                        <option value="">Select treatment</option>
                        @for (category of jurisdiction.categories; track category.id) {
                          <option [value]="category.id">{{ category.name }}</option>
                        }
                      </select></label
                    >
                    <div class="mt-3 grid grid-cols-2 gap-2">
                      <label class="form-control"
                        ><span class="label-text mb-1">Rate (%)</span
                        ><input
                          type="number"
                          min="0"
                          step="0.01"
                          class="input input-bordered input-sm"
                          [formControl]="ratePercent" /></label
                      ><label class="form-control"
                        ><span class="label-text mb-1">Effective from</span
                        ><input
                          type="date"
                          class="input input-bordered input-sm"
                          [formControl]="effectiveFrom"
                      /></label>
                    </div>
                    <label class="form-control mt-3"
                      ><span class="label-text mb-1">Effective to (optional)</span
                      ><input
                        type="date"
                        class="input input-bordered input-sm"
                        [formControl]="effectiveTo"
                    /></label>
                    <label class="form-control mt-3"
                      ><span class="label-text mb-1">Supporting notes</span
                      ><textarea
                        class="textarea textarea-bordered textarea-sm"
                        [formControl]="notes"
                      ></textarea>
                    </label>
                    <button class="btn btn-outline btn-sm mt-4" type="submit" [disabled]="saving()">
                      Add immutable rate
                    </button>
                  </form>
                </div>
              </div>
            </section>
          } @else {
            <div
              class="rounded-box border border-dashed border-base-300 p-8 text-center text-base-content/60"
            >
              Select a package or add a country.
            </div>
          }
        </main>
      </div>
    </div>
  `,
})
export class TaxComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly catalog = signal<PlatformTaxJurisdiction[]>([]);
  protected readonly selectedId = signal('');
  protected readonly selected = computed(
    () => this.catalog().find(item => item.id === this.selectedId()) ?? null
  );
  protected readonly addingCountry = signal(false);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly countryName = new FormControl('', { nonNullable: true });
  protected readonly countryCode = new FormControl('', { nonNullable: true });
  protected readonly currencyCode = new FormControl('', { nonNullable: true });
  protected readonly timezone = new FormControl('Africa/Nairobi', { nonNullable: true });
  protected readonly categoryId = new FormControl('', { nonNullable: true });
  protected readonly activationCategoryId = signal('');
  protected readonly categoryEffectiveFrom = new FormControl(
    new Date().toISOString().slice(0, 10),
    { nonNullable: true }
  );
  protected readonly ratePercent = new FormControl(0, { nonNullable: true });
  protected readonly effectiveFrom = new FormControl(new Date().toISOString().slice(0, 10), {
    nonNullable: true,
  });
  protected readonly effectiveTo = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly categoryCode = new FormControl('', { nonNullable: true });
  protected readonly categoryName = new FormControl('', { nonNullable: true });
  protected readonly classification = new FormControl<
    'standard' | 'special' | 'zero_rated' | 'exempt'
  >('standard', { nonNullable: true });
  protected readonly isDefault = new FormControl(false, { nonNullable: true });

  async ngOnInit(): Promise<void> {
    await this.load();
  }
  protected startCountry(): void {
    this.addingCountry.set(true);
    this.error.set(null);
  }
  protected selectPackage(id: string): void {
    this.addingCountry.set(false);
    this.selectedId.set(id);
    this.categoryId.setValue('');
  }
  protected selectCategory(id: string): void {
    this.categoryId.setValue(id);
  }
  protected selectCategoryActivation(id: string): void {
    this.activationCategoryId.set(id);
    this.categoryEffectiveFrom.setValue(new Date().toISOString().slice(0, 10));
  }
  protected hasRates(item: PlatformTaxJurisdiction): boolean {
    return (
      item.categories.length > 0 &&
      item.categories.every(category => (category.rates?.length ?? 0) > 0)
    );
  }
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const value = await this.platform.taxCatalog();
      this.catalog.set(value);
      if (!this.selectedId()) this.selectedId.set(value[0]?.id ?? '');
    } catch (error) {
      this.fail(error, 'Could not load VAT packages');
    } finally {
      this.loading.set(false);
    }
  }
  protected async saveCountry(): Promise<void> {
    if (
      !this.countryName.value.trim() ||
      !this.countryCode.value.trim() ||
      !this.currencyCode.value.trim() ||
      !this.timezone.value.trim()
    ) {
      this.error.set('Country, codes and timezone are required.');
      return;
    }
    await this.run(async () => {
      const id = await this.platform.upsertTaxJurisdiction({
        countryCode: this.countryCode.value,
        name: this.countryName.value,
        currencyCode: this.currencyCode.value,
        timezone: this.timezone.value,
      });
      this.selectedId.set(id);
      this.addingCountry.set(false);
      this.notice.set('Draft package created. Add required treatments and rates.');
      await this.load();
    }, 'Could not create country package');
  }
  protected async saveCategory(): Promise<void> {
    const item = this.selected();
    if (!item || !this.categoryCode.value.trim() || !this.categoryName.value.trim()) {
      this.error.set('Code and name are required.');
      return;
    }
    await this.run(async () => {
      await this.platform.upsertTaxCategory({
        jurisdictionId: item.id,
        code: this.categoryCode.value,
        name: this.categoryName.value,
        classification: this.classification.value,
        isDefault: item.status === 'draft' && this.isDefault.value,
        active: item.status === 'draft',
      });
      this.categoryCode.setValue('');
      this.categoryName.setValue('');
      this.isDefault.setValue(false);
      await this.load();
    }, 'Could not add treatment');
  }
  protected async saveRate(): Promise<void> {
    const rate = Number(this.ratePercent.value);
    if (!this.categoryId.value || !Number.isFinite(rate) || rate < 0 || !this.effectiveFrom.value) {
      this.error.set('Treatment, rate and effective date are required.');
      return;
    }
    await this.run(async () => {
      await this.platform.publishTaxRate({
        categoryId: this.categoryId.value,
        rateBps: Math.round(rate * 100),
        effectiveFrom: this.effectiveFrom.value,
        effectiveTo: this.effectiveTo.value || undefined,
        notes: this.notes.value.trim() || undefined,
      });
      this.notice.set('Rate version added.');
      await this.load();
    }, 'Could not add rate');
  }
  protected async publishCategory(id: string): Promise<void> {
    if (!this.categoryEffectiveFrom.value) {
      this.error.set('Choose the first usable date.');
      return;
    }
    await this.run(async () => {
      await this.platform.publishTaxCategory(id, this.categoryEffectiveFrom.value);
      this.activationCategoryId.set('');
      this.notice.set(`Treatment activates on ${this.categoryEffectiveFrom.value}.`);
      await this.load();
    }, 'Could not activate treatment');
  }
  protected async publishPackage(id: string): Promise<void> {
    await this.run(async () => {
      await this.platform.publishTaxPackage(id);
      this.notice.set('Country package published and now available to shops.');
      await this.load();
    }, 'Could not publish package');
  }
  private async run(action: () => Promise<void>, message: string): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
    } catch (error) {
      this.fail(error, message);
    } finally {
      this.saving.set(false);
    }
  }
  private fail(error: unknown, fallback: string): void {
    this.error.set(error instanceof Error ? error.message : fallback);
  }
}

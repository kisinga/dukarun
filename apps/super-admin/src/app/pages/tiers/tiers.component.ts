import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { formatKesInput, parseKes } from '../../core/money';
import { PlatformService, Tier } from '../../core/platform.service';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import { DrawerComponent } from '../../shared/ui/drawer.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const LIMIT_FIELDS = [
  { key: 'max_team_members', label: 'Team members', help: 'Approved company memberships.' },
  {
    key: 'max_products',
    label: 'Products',
    help: 'Active product variants. Above 10,000 requires Enterprise.',
  },
  {
    key: 'max_stock_locations',
    label: 'Stock locations',
    help: 'Requires multiple locations when greater than one.',
  },
  { key: 'max_orders_per_month', label: 'Monthly sales', help: 'Non-voided sales per month.' },
  { key: 'sms_per_period', label: 'Monthly SMS', help: 'Messages in each monthly SMS period.' },
  {
    key: 'whatsapp_per_period',
    label: 'Monthly WhatsApp',
    help: 'WhatsApp deliveries in each monthly communication period.',
  },
] as const;

const FEATURE_FIELDS = [
  {
    key: 'multiple_locations_enabled',
    label: 'Multiple stock locations',
    help: 'Create and manage more than the default location.',
  },
  {
    key: 'staff_performance_enabled',
    label: 'Staff performance',
    help: 'Staff sales attribution and performance reports.',
  },
  {
    key: 'commissions_available',
    label: 'Commissions',
    help: 'Makes company-level commission settings available.',
  },
  {
    key: 'storefront_available',
    label: 'Public storefront',
    help: 'Publish a public catalogue with seven-day downgrade grace.',
  },
  {
    key: 'payment_reminders_available',
    label: 'Payment reminders',
    help: 'Enable due-date reminder automation and secure statements.',
  },
] as const;

@Component({
  selector: 'app-tiers',
  imports: [
    ReactiveFormsModule,
    NgIcon,
    PageHeaderComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    DataTableShellComponent,
    DrawerComponent,
    FormFieldComponent,
    MoneyComponent,
  ],
  template: `
    <app-page-header
      title="Subscription tiers"
      subtitle="Pricing, usage limits and platform capabilities"
    >
      <button actions class="btn btn-primary btn-sm min-h-11 gap-2" (click)="startCreate()">
        <ng-icon name="heroPlus" /> New tier
      </button>
    </app-page-header>

    @if (error()) {
      <div class="alert alert-error mb-4" role="alert">
        <span>{{ error() }}</span>
      </div>
    }
    @if (notice()) {
      <div class="alert alert-success mb-4" role="status">
        <span>{{ notice() }}</span>
      </div>
    }

    <form
      class="card mb-4 space-y-4 bg-base-100 p-4"
      (submit)="$event.preventDefault(); saveBillingPolicy()"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="section-title">New-company offer</h2>
          <p class="type-caption mt-1">
            Require an upfront monthly payment, then add free bonus months.
          </p>
        </div>
        <label
          class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field bg-base-200 px-3"
        >
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            [formControl]="introOfferEnabled"
          />
          <span class="text-sm font-medium">Offer enabled</span>
        </label>
      </div>

      @if (introOfferEnabled.value) {
        <div class="grid gap-4 md:grid-cols-3">
          <app-form-field label="Assigned plan" hint="Plan granted after successful payment.">
            <select class="select select-bordered w-full" [formControl]="introOfferTier">
              @for (tier of activeTiers(); track tier.id) {
                <option [value]="tier.id">{{ tier.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field label="Months paid" hint="Charged at the plan's monthly price.">
            <input
              type="number"
              min="1"
              max="12"
              class="input input-bordered w-full"
              [formControl]="introOfferPaidMonths"
            />
          </app-form-field>
          <app-form-field label="Free months" hint="Added after payment at no charge.">
            <input
              type="number"
              min="0"
              max="12"
              class="input input-bordered w-full"
              [formControl]="introOfferBonusMonths"
            />
          </app-form-field>
        </div>
        <div class="alert alert-info py-3 text-sm">
          {{ introOfferPreview() }}
        </div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2">
          <app-form-field
            label="Free trial duration"
            hint="Days granted after approval. Existing trials keep their end date."
          >
            <input
              type="number"
              min="1"
              max="365"
              class="input input-bordered w-full"
              [formControl]="trialDays"
            />
          </app-form-field>
          <app-form-field label="Default trial tier">
            <select class="select select-bordered w-full" [formControl]="defaultTrialTier">
              @for (tier of activeTiers(); track tier.id) {
                <option [value]="tier.id">{{ tier.name }}</option>
              }
            </select>
          </app-form-field>
        </div>
      }

      <div class="flex justify-end">
        <button
          type="submit"
          class="btn btn-primary min-h-11"
          [disabled]="configBusy() || !defaultTrialTier.value || !introOfferTier.value"
        >
          {{ configBusy() ? 'Saving…' : 'Save billing policy' }}
        </button>
      </div>
    </form>

    @if (tiers().length === 0) {
      <app-empty-state
        title="No subscription tiers"
        description="Create a tier to define pricing and tenant capabilities."
        ctaLabel="New tier"
        (ctaClick)="startCreate()"
      />
    } @else {
      <div class="hidden md:block">
        <app-data-table-shell>
          <table class="table">
            <thead>
              <tr>
                <th>Tier</th>
                <th class="text-right">Monthly (KES)</th>
                <th class="text-right">Yearly (KES)</th>
                <th>Limits</th>
                <th>Capabilities</th>
                <th>Status</th>
                <th class="w-12"><span class="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              @for (tier of tiers(); track tier.id) {
                <tr
                  role="button"
                  tabindex="0"
                  (click)="startEdit(tier)"
                  (keydown.enter)="startEdit(tier)"
                >
                  <td>
                    <p class="table-primary">{{ tier.name }}</p>
                    <p class="table-secondary font-mono">{{ tier.code }}</p>
                  </td>
                  <td class="table-number"><app-money [amount]="tier.price_monthly" /></td>
                  <td class="table-number"><app-money [amount]="tier.price_yearly" /></td>
                  <td class="max-w-64 text-xs text-base-content/60">{{ limitSummary(tier) }}</td>
                  <td class="max-w-64 text-xs text-base-content/60">{{ featureSummary(tier) }}</td>
                  <td>
                    <app-status-badge
                      size="sm"
                      [type]="tier.is_active ? 'success' : 'neutral'"
                      [label]="tier.is_active ? 'active' : 'inactive'"
                    />
                  </td>
                  <td class="text-right text-base-content/40">
                    <ng-icon name="heroChevronRight" />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </app-data-table-shell>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 md:hidden">
        @for (tier of tiers(); track tier.id) {
          <button type="button" class="card bg-base-100 p-4 text-left" (click)="startEdit(tier)">
            <span class="flex items-start justify-between gap-3">
              <span>
                <strong class="block text-sm">{{ tier.name }}</strong>
                <span class="type-caption font-mono">{{ tier.code }}</span>
              </span>
              <app-status-badge
                size="sm"
                [type]="tier.is_active ? 'success' : 'neutral'"
                [label]="tier.is_active ? 'active' : 'inactive'"
              />
            </span>
            <span class="mt-4 grid grid-cols-2 gap-3 border-t border-base-300/60 pt-3">
              <span>
                <span class="type-caption block">Monthly</span>
                <strong class="mt-1 block text-sm tabular-nums">
                  <app-money [amount]="tier.price_monthly" [showCurrency]="true" />
                </strong>
              </span>
              <span>
                <span class="type-caption block">Yearly</span>
                <strong class="mt-1 block text-sm tabular-nums">
                  <app-money [amount]="tier.price_yearly" [showCurrency]="true" />
                </strong>
              </span>
            </span>
          </button>
        }
      </div>
    }

    @if (editorMounted()) {
      <app-drawer
        [open]="drawerOpen()"
        (openChange)="drawerOpen.set($event)"
        [title]="editing() ? 'Edit ' + editing()!.name : 'New subscription tier'"
        subtitle="Pricing, limits and capabilities"
        (closed)="editorClosed()"
      >
        <form id="tier-editor-form" class="space-y-8" (submit)="$event.preventDefault(); save()">
          @if (error()) {
            <div class="alert alert-error text-sm" role="alert">{{ error() }}</div>
          }

          <section class="space-y-4">
            <div>
              <h3 class="section-title">Tier identity</h3>
              <p class="type-caption mt-1">The code is permanent after creation.</p>
            </div>
            <app-form-field label="Code" hint="For example: standard" [required]="!editing()">
              <input
                type="text"
                class="input input-bordered w-full"
                [disabled]="editing() !== null"
                [formControl]="code"
              />
            </app-form-field>
            <app-form-field label="Name" [required]="true">
              <input type="text" class="input input-bordered w-full" [formControl]="name" />
            </app-form-field>
            @if (editing()) {
              <label
                class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field bg-base-200 px-3"
              >
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-sm"
                  [formControl]="isActive"
                />
                <span class="text-sm font-medium">Available to companies</span>
              </label>
            }
          </section>

          <section class="space-y-4 border-t border-base-300/60 pt-6">
            <div>
              <h3 class="section-title">Pricing</h3>
              <p class="type-caption mt-1">Whole Kenyan shillings.</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <app-form-field label="Monthly price (KES)">
                <input
                  type="text"
                  inputmode="numeric"
                  class="input input-bordered w-full"
                  [formControl]="priceMonthly"
                />
              </app-form-field>
              <app-form-field label="Yearly price (KES)">
                <input
                  type="text"
                  inputmode="numeric"
                  class="input input-bordered w-full"
                  [formControl]="priceYearly"
                />
              </app-form-field>
            </div>
          </section>

          <section class="space-y-4 border-t border-base-300/60 pt-6">
            <div>
              <h3 class="section-title">Usage limits</h3>
              <p class="type-caption mt-1">
                Leave blank for unlimited; use zero to block new usage.
              </p>
            </div>
            <div class="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              @for (field of limitFields; track field.key) {
                <app-form-field [label]="field.label" [hint]="field.help">
                  <input
                    type="number"
                    min="0"
                    class="input input-bordered w-full"
                    [value]="limits()[field.key] ?? ''"
                    (input)="setLimit(field.key, $any($event.target).value)"
                  />
                </app-form-field>
              }
            </div>
          </section>

          <fieldset class="space-y-2 border-t border-base-300/60 pt-6">
            <legend class="section-title mb-2">Capabilities</legend>
            @for (field of featureFields; track field.key) {
              <label
                class="flex min-h-11 cursor-pointer items-start gap-3 rounded-field px-2 py-2 hover:bg-base-200/60"
              >
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary checkbox-sm mt-0.5"
                  [checked]="features()[field.key] === true"
                  (change)="setFeature(field.key, $any($event.target).checked)"
                />
                <span>
                  <span class="block text-sm font-medium">{{ field.label }}</span>
                  <span class="type-caption mt-0.5 block">{{ field.help }}</span>
                </span>
              </label>
            }
          </fieldset>
        </form>

        <div footer class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="btn btn-ghost min-h-11 sm:min-w-24"
            [disabled]="busy()"
            (click)="closeEditor()"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="tier-editor-form"
            class="btn btn-primary min-h-11 sm:min-w-40"
            [disabled]="busy() || name.value.trim().length === 0"
          >
            @if (busy()) {
              <span class="loading loading-spinner loading-sm"></span>
            }
            {{ busy() ? 'Saving…' : editing() ? 'Save changes' : 'Create tier' }}
          </button>
        </div>
      </app-drawer>
    }
  `,
})
export class TiersComponent implements OnInit {
  private readonly platform = inject(PlatformService);

  protected readonly limitFields = LIMIT_FIELDS;
  protected readonly featureFields = FEATURE_FIELDS;
  protected readonly tiers = signal<Tier[]>([]);
  protected readonly activeTiers = signal<Tier[]>([]);
  protected readonly editorMounted = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly editing = signal<Tier | null>(null);

  protected readonly code = new FormControl('', { nonNullable: true });
  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly priceMonthly = new FormControl('', { nonNullable: true });
  protected readonly priceYearly = new FormControl('', { nonNullable: true });
  protected readonly isActive = new FormControl(true, { nonNullable: true });
  protected readonly trialDays = new FormControl(30, { nonNullable: true });
  protected readonly defaultTrialTier = new FormControl('', { nonNullable: true });
  protected readonly introOfferEnabled = new FormControl(false, { nonNullable: true });
  protected readonly introOfferTier = new FormControl('', { nonNullable: true });
  protected readonly introOfferPaidMonths = new FormControl(1, { nonNullable: true });
  protected readonly introOfferBonusMonths = new FormControl(1, { nonNullable: true });
  protected readonly limits = signal<Record<string, number | undefined>>({});
  protected readonly features = signal<Record<string, boolean>>({});

  protected readonly busy = signal(false);
  protected readonly configBusy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    const [tiers, config] = await Promise.allSettled([
      this.platform.tiers(),
      this.platform.billingConfig(),
    ]);
    if (tiers.status === 'fulfilled') {
      this.tiers.set(tiers.value);
      this.activeTiers.set(tiers.value.filter(tier => tier.is_active));
    } else {
      this.error.set(tiers.reason instanceof Error ? tiers.reason.message : 'Failed to load tiers');
      return;
    }
    if (config.status === 'fulfilled' && config.value) {
      const billingConfig = config.value;
      this.trialDays.setValue(billingConfig.trialDays);
      this.defaultTrialTier.setValue(
        tiers.value.find(tier => tier.code === billingConfig.defaultTrialTierCode)?.id ?? ''
      );
      this.introOfferEnabled.setValue(billingConfig.introOfferEnabled);
      this.introOfferTier.setValue(
        tiers.value.find(tier => tier.code === billingConfig.introOfferTierCode)?.id ?? ''
      );
      this.introOfferPaidMonths.setValue(billingConfig.introOfferPaidMonths);
      this.introOfferBonusMonths.setValue(billingConfig.introOfferBonusMonths);
      this.error.set(null);
    } else if (config.status === 'fulfilled') {
      this.defaultTrialTier.setValue(this.activeTiers()[0]?.id ?? '');
      this.introOfferTier.setValue(this.activeTiers()[0]?.id ?? '');
      this.error.set('Tiers loaded; billing policy is not configured yet');
    } else {
      this.error.set(
        config.reason instanceof Error
          ? `Tiers loaded; billing policy unavailable: ${config.reason.message}`
          : 'Tiers loaded; billing policy unavailable'
      );
    }
  }

  protected async saveBillingPolicy(): Promise<void> {
    const days = Math.round(this.trialDays.value);
    const paidMonths = Math.round(this.introOfferPaidMonths.value);
    const bonusMonths = Math.round(this.introOfferBonusMonths.value);
    if (
      days < 1 ||
      days > 365 ||
      paidMonths < 1 ||
      paidMonths > 12 ||
      bonusMonths < 0 ||
      bonusMonths > 12 ||
      !this.defaultTrialTier.value ||
      !this.introOfferTier.value
    ) {
      this.error.set('Choose active plans and valid paid, free, and trial durations');
      return;
    }
    this.configBusy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.platform.updateBillingPolicy({
        trialDays: days,
        defaultTrialTierId: this.defaultTrialTier.value,
        introOfferEnabled: this.introOfferEnabled.value,
        introOfferTierId: this.introOfferTier.value,
        introOfferPaidMonths: paidMonths,
        introOfferBonusMonths: bonusMonths,
      });
      this.trialDays.setValue(days);
      this.introOfferPaidMonths.setValue(paidMonths);
      this.introOfferBonusMonths.setValue(bonusMonths);
      this.notice.set('Billing policy updated. Existing company access is unchanged.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Billing policy update failed');
    } finally {
      this.configBusy.set(false);
    }
  }

  protected introOfferPreview(): string {
    const tier = this.activeTiers().find(item => item.id === this.introOfferTier.value);
    const paid = Math.max(1, Math.round(this.introOfferPaidMonths.value));
    const free = Math.max(0, Math.round(this.introOfferBonusMonths.value));
    const paidLabel = `${paid} ${paid === 1 ? 'month' : 'months'}`;
    const freeLabel = `${free} ${free === 1 ? 'month' : 'months'}`;
    const amount = tier ? formatKesInput(tier.price_monthly * paid) : '—';
    const wording =
      free > 0 ? `Pay for ${paidLabel}, get ${freeLabel} free` : `Pay for ${paidLabel}`;
    return `Customer wording: ${wording} on ${tier?.name ?? 'the selected plan'} — KES ${amount}.`;
  }

  protected setLimit(key: string, value: string): void {
    const number = value === '' ? undefined : Math.max(0, Math.round(Number(value)));
    this.limits.update(limits => ({ ...limits, [key]: number }));
  }

  protected setFeature(key: string, enabled: boolean): void {
    this.features.update(features => ({ ...features, [key]: enabled }));
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.code.setValue('');
    this.name.setValue('');
    this.priceMonthly.setValue('');
    this.priceYearly.setValue('');
    this.isActive.setValue(true);
    this.limits.set({ max_products: 10_000 });
    this.features.set({});
    this.openEditor();
  }

  protected startEdit(tier: Tier): void {
    this.editing.set(tier);
    this.code.setValue(tier.code);
    this.name.setValue(tier.name);
    this.priceMonthly.setValue(formatKesInput(tier.price_monthly));
    this.priceYearly.setValue(formatKesInput(tier.price_yearly));
    this.isActive.setValue(tier.is_active);
    this.limits.set({
      max_team_members: tier.max_team_members ?? undefined,
      max_products: tier.max_products ?? undefined,
      max_stock_locations: tier.max_stock_locations ?? undefined,
      max_orders_per_month: tier.max_orders_per_month ?? undefined,
      sms_per_period: tier.sms_per_period ?? undefined,
      whatsapp_per_period: tier.whatsapp_per_period ?? undefined,
    });
    this.features.set({
      multiple_locations_enabled: tier.multiple_locations_enabled,
      staff_performance_enabled: tier.staff_performance_enabled,
      commissions_available: tier.commissions_available,
      storefront_available: tier.storefront_available,
      payment_reminders_available: tier.payment_reminders_available,
    });
    this.openEditor();
  }

  protected closeEditor(): void {
    this.drawerOpen.set(false);
  }

  protected editorClosed(): void {
    this.editorMounted.set(false);
    this.editing.set(null);
  }

  private openEditor(): void {
    this.error.set(null);
    this.editorMounted.set(true);
    this.drawerOpen.set(true);
  }

  protected async save(): Promise<void> {
    const monthly = parseKes(this.priceMonthly.value);
    const yearly = parseKes(this.priceYearly.value);
    if (monthly === null || yearly === null) {
      this.error.set('Enter valid monthly and yearly prices');
      return;
    }
    if (!this.editing() && this.code.value.trim().length === 0) {
      this.error.set('A tier code is required');
      return;
    }
    const productLimit = this.limits()['max_products'] ?? 10_000;
    if (productLimit > 10_000) {
      this.error.set('Product limits above 10,000 require Enterprise');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const editing = this.editing();
      await this.platform.upsertTier({
        code: this.code.value.trim(),
        name: this.name.value.trim(),
        price_monthly: monthly,
        price_yearly: yearly,
        multiple_locations_enabled: this.features()['multiple_locations_enabled'] === true,
        staff_performance_enabled: this.features()['staff_performance_enabled'] === true,
        commissions_available: this.features()['commissions_available'] === true,
        max_team_members: this.limits()['max_team_members'] ?? null,
        max_products: productLimit,
        max_stock_locations: this.limits()['max_stock_locations'] ?? null,
        max_orders_per_month: this.limits()['max_orders_per_month'] ?? null,
        sms_per_period: this.limits()['sms_per_period'] ?? null,
        whatsapp_per_period: this.limits()['whatsapp_per_period'] ?? null,
        storefront_available: this.features()['storefront_available'] === true,
        customer_campaigns_available: false,
        payment_reminders_available: this.features()['payment_reminders_available'] === true,
        ...(editing ? { tier_id: editing.id, is_active: this.isActive.value } : {}),
      });
      this.notice.set(editing ? 'Tier updated' : 'Tier created');
      this.closeEditor();
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected limitSummary(tier: Tier): string {
    const values = tier as unknown as Record<string, number | null>;
    const configured = LIMIT_FIELDS.filter(field => values[field.key] !== null).map(
      field => `${field.label}: ${values[field.key]}`
    );
    return configured.length > 0 ? configured.join(' · ') : 'Unlimited';
  }

  protected featureSummary(tier: Tier): string {
    const values = tier as unknown as Record<string, boolean>;
    const enabled = FEATURE_FIELDS.filter(field => values[field.key]).map(field => field.label);
    return enabled.length > 0 ? enabled.join(' · ') : 'Core only';
  }
}

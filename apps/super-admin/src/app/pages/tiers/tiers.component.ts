import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { formatKes, formatKesInput, parseKes } from '../../core/money';
import { PlatformService, Tier } from '../../core/platform.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const LIMIT_FIELDS = [
  {
    key: 'max_team_members',
    label: 'Max team members',
    help: 'Approved company memberships.',
  },
  { key: 'max_products', label: 'Max products', help: 'Active product variants.' },
  {
    key: 'max_stock_locations',
    label: 'Max stock locations',
    help: 'Requires Multiple stock locations when greater than one.',
  },
  { key: 'max_orders_per_month', label: 'Max sales/mo', help: 'Non-voided sales per month.' },
  { key: 'sms_per_period', label: 'SMS/mo', help: 'Messages reserved in the monthly SMS period.' },
] as const;

const FEATURE_FIELDS = [
  {
    key: 'multiple_locations_enabled',
    label: 'Multiple stock locations',
    help: 'Allows creating and managing more than the provisioned default location.',
  },
  {
    key: 'staff_performance_enabled',
    label: 'Staff performance',
    help: 'Enables staff sales attribution and performance reports for permitted users.',
  },
  {
    key: 'commissions_available',
    label: 'Commissions',
    help: 'Makes commissions available; each company must also enable commissions in Settings.',
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
  ],
  template: `
    <app-page-header title="Subscription tiers">
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

    <!-- Create / edit form -->
    @if (formOpen()) {
      <div class="card mb-4 bg-base-100">
        <div class="card-body p-4">
          <h2 class="type-heading">
            {{ editing() ? 'Edit ' + editing()!.name : 'New tier' }}
          </h2>
          <p class="text-sm text-base-content/60">
            Features enable capabilities. Limits cap usage; leave a limit blank for unlimited, or
            set it to 0 to block new usage.
          </p>
          <form (submit)="$event.preventDefault(); save()" class="mt-2 grid gap-3 sm:grid-cols-2">
            <label class="form-control">
              <span class="label-text">Code</span>
              <input
                type="text"
                class="input input-bordered input-sm"
                placeholder="e.g. standard"
                [disabled]="editing() !== null"
                [formControl]="code"
              />
            </label>
            <label class="form-control">
              <span class="label-text">Name *</span>
              <input type="text" class="input input-bordered input-sm" [formControl]="name" />
            </label>
            <label class="form-control">
              <span class="label-text">Monthly price (KES)</span>
              <input
                type="text"
                inputmode="numeric"
                class="input input-bordered input-sm"
                [formControl]="priceMonthly"
              />
            </label>
            <label class="form-control">
              <span class="label-text">Yearly price (KES)</span>
              <input
                type="text"
                inputmode="numeric"
                class="input input-bordered input-sm"
                [formControl]="priceYearly"
              />
            </label>
            @for (field of limitFields; track field.key) {
              <label class="form-control">
                <span class="label-text">{{ field.label }}</span>
                <input
                  type="number"
                  min="0"
                  class="input input-bordered input-sm"
                  [value]="limits()[field.key] ?? ''"
                  (input)="setLimit(field.key, $any($event.target).value)"
                />
                <span class="label-text-alt text-base-content/60">{{ field.help }}</span>
              </label>
            }
            <fieldset class="sm:col-span-2">
              <legend class="label-text mb-1 font-semibold">Features</legend>
              @for (field of featureFields; track field.key) {
                <div class="py-1">
                  <label class="label cursor-pointer justify-start gap-2 py-0">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [checked]="features()[field.key] === true"
                      (change)="setFeature(field.key, $any($event.target).checked)"
                    />
                    <span class="label-text">{{ field.label }}</span>
                  </label>
                  <p class="ml-8 text-xs text-base-content/60">{{ field.help }}</p>
                </div>
              }
            </fieldset>
            @if (editing()) {
              <label class="label cursor-pointer justify-start gap-2">
                <input type="checkbox" class="checkbox checkbox-sm" [formControl]="isActive" />
                <span class="label-text">Active</span>
              </label>
            }
            <div class="flex flex-wrap gap-2 border-t border-base-300/60 pt-3 sm:col-span-2">
              <button
                type="submit"
                class="btn btn-primary btn-sm min-h-11"
                [disabled]="busy() || name.value.trim().length === 0"
              >
                {{ busy() ? 'Saving…' : editing() ? 'Save tier' : 'Create tier' }}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="closeForm()">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (tiers().length === 0) {
      <app-empty-state title="No tiers" description="Create the first subscription tier above." />
    } @else {
      <div class="card bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th class="text-right">Monthly</th>
              <th class="text-right">Yearly</th>
              <th>Limits</th>
              <th>Features</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (t of tiers(); track t.id) {
              <tr>
                <td class="font-mono text-xs">{{ t.code }}</td>
                <td class="text-sm font-medium">{{ t.name }}</td>
                <td class="text-right">{{ fmt(t.price_monthly) }}</td>
                <td class="text-right">{{ fmt(t.price_yearly) }}</td>
                <td class="text-xs text-base-content/60">{{ limitSummary(t) }}</td>
                <td class="text-xs text-base-content/60">{{ featureSummary(t) }}</td>
                <td>
                  <app-status-badge
                    size="xs"
                    [type]="t.is_active ? 'success' : 'neutral'"
                    [label]="t.is_active ? 'active' : 'inactive'"
                  />
                </td>
                <td class="text-right">
                  <button class="btn btn-ghost btn-xs" (click)="startEdit(t)">Edit</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class TiersComponent implements OnInit {
  private readonly platform = inject(PlatformService);

  protected readonly fmt = formatKes;
  protected readonly limitFields = LIMIT_FIELDS;
  protected readonly featureFields = FEATURE_FIELDS;
  protected readonly tiers = signal<Tier[]>([]);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Tier | null>(null);

  protected readonly code = new FormControl('', { nonNullable: true });
  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly priceMonthly = new FormControl('', { nonNullable: true });
  protected readonly priceYearly = new FormControl('', { nonNullable: true });
  protected readonly isActive = new FormControl(true, { nonNullable: true });
  protected readonly limits = signal<Record<string, number | undefined>>({});
  protected readonly features = signal<Record<string, boolean>>({});

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.tiers.set(await this.platform.tiers());
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load tiers');
    }
  }

  protected setLimit(key: string, value: string): void {
    const num = value === '' ? undefined : Math.max(0, Math.round(Number(value)));
    this.limits.update(l => ({ ...l, [key]: num }));
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
    this.limits.set({});
    this.features.set({});
    this.formOpen.set(true);
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
    });
    this.features.set({
      multiple_locations_enabled: tier.multiple_locations_enabled,
      staff_performance_enabled: tier.staff_performance_enabled,
      commissions_available: tier.commissions_available,
    });
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected async save(): Promise<void> {
    const monthly = parseKes(this.priceMonthly.value);
    const yearly = parseKes(this.priceYearly.value);
    if (monthly === null || yearly === null) {
      this.error.set('Enter valid monthly and yearly prices');
      return;
    }
    if (!this.editing() && this.code.value.trim().length === 0) {
      this.error.set('A code is required (e.g. standard)');
      return;
    }
    const limits: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.limits())) {
      if (v !== undefined) limits[k] = v;
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
        max_team_members: limits['max_team_members'] ?? null,
        max_products: limits['max_products'] ?? null,
        max_stock_locations: limits['max_stock_locations'] ?? null,
        max_orders_per_month: limits['max_orders_per_month'] ?? null,
        sms_per_period: limits['sms_per_period'] ?? null,
        ...(editing ? { tier_id: editing.id, is_active: this.isActive.value } : {}),
      });
      this.notice.set(editing ? 'Tier updated' : 'Tier created');
      this.closeForm();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
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

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocationContextService } from '../core/location-context.service';
import { PermissionsService } from '../core/permissions.service';
import { SupabaseService } from '../core/supabase.service';
import { FulfillmentService, type FulfillmentSettings } from '../fulfillment/fulfillment.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';

interface FeeVariant {
  id: string;
  name: string;
  price: number;
}

type EditableSettingKey =
  | 'enabled'
  | 'pickup_enabled'
  | 'delivery_enabled'
  | 'cod_enabled'
  | 'default_delivery_fee_variant_id'
  | 'pickup_sla_minutes'
  | 'delivery_sla_minutes'
  | 'notification_channel'
  | 'sms_fallback'
  | 'notify_ready'
  | 'notify_in_transit'
  | 'notify_failed'
  | 'notify_fulfilled';

const EDITABLE_SETTING_KEYS: readonly EditableSettingKey[] = [
  'enabled',
  'pickup_enabled',
  'delivery_enabled',
  'cod_enabled',
  'default_delivery_fee_variant_id',
  'pickup_sla_minutes',
  'delivery_sla_minutes',
  'notification_channel',
  'sms_fallback',
  'notify_ready',
  'notify_in_transit',
  'notify_failed',
  'notify_fulfilled',
];

@Component({
  selector: 'app-fulfillment-settings',
  imports: [FormsModule, ButtonComponent, IconComponent],
  template: `
    <div>
      <section
        class="grid gap-4 border-b border-base-300/70 pb-5 md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)] md:items-end md:gap-8"
      >
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Location</span>
          <select
            class="select select-bordered min-h-11 w-full"
            aria-label="Pickup and delivery location"
            [ngModel]="selectedLocationId()"
            [disabled]="loading() || busy()"
            (ngModelChange)="requestLocationChange($event)"
          >
            @for (location of locations.locations(); track location.id) {
              <option [value]="location.id">{{ location.name }}</option>
            }
          </select>
          <span class="type-caption mt-1 block">Settings apply only to this location.</span>
        </label>

        @if (draft(); as current) {
          <label
            class="flex min-h-16 cursor-pointer items-center justify-between gap-4 border-y border-base-300/70 py-3 md:border-b-0 md:border-t-0 md:border-l md:py-0 md:pl-8"
          >
            <span class="min-w-0">
              <span class="block text-sm font-semibold">Accept pickup and delivery orders</span>
              <span class="type-caption mt-0.5 block">
                @if (current.enabled) {
                  Orders can use the methods configured below.
                } @else {
                  This location continues to accept counter sales only.
                }
              </span>
            </span>
            <input
              type="checkbox"
              class="toggle toggle-primary shrink-0"
              aria-label="Accept pickup and delivery orders"
              [ngModel]="current.enabled"
              [disabled]="!current.feature_available || busy()"
              (ngModelChange)="updateDraft('enabled', $event)"
            />
          </label>
        }
      </section>

      @if (loading()) {
        <div class="space-y-6 py-6" aria-label="Loading pickup and delivery settings">
          <div class="skeleton h-24 w-full"></div>
          <div class="skeleton h-40 w-full"></div>
          <div class="skeleton h-40 w-full"></div>
        </div>
      } @else if (draft(); as current) {
        @if (!current.feature_available) {
          <div
            role="status"
            class="mt-5 flex items-start gap-3 border-y border-warning/35 bg-warning/5 px-3 py-3 text-sm"
          >
            <app-icon name="heroInformationCircle" class="mt-0.5 text-warning" />
            <p>Pickup and delivery are unavailable on the current plan.</p>
          </div>
        }

        <fieldset
          class="transition-opacity"
          [disabled]="!current.enabled || busy()"
          [class.opacity-55]="!current.enabled"
        >
          <section
            class="grid gap-4 border-b border-base-300/70 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8"
          >
            <header>
              <h3 class="section-title">Order methods</h3>
              <p class="type-caption mt-1">Choose how customers receive orders from here.</p>
            </header>

            <div class="divide-y divide-base-300/70 border-y border-base-300/70">
              <label class="flex min-h-16 cursor-pointer items-center justify-between gap-4 py-3">
                <span>
                  <span class="block text-sm font-medium">Pickup</span>
                  <span class="type-caption mt-0.5 block"
                    >Prepare for collection at this location.</span
                  >
                </span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary shrink-0"
                  [ngModel]="current.pickup_enabled"
                  (ngModelChange)="updateDraft('pickup_enabled', $event)"
                />
              </label>
              <label class="flex min-h-16 cursor-pointer items-center justify-between gap-4 py-3">
                <span>
                  <span class="block text-sm font-medium">Delivery</span>
                  <span class="type-caption mt-0.5 block">Dispatch orders to a recipient.</span>
                </span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary shrink-0"
                  [ngModel]="current.delivery_enabled"
                  (ngModelChange)="setDeliveryEnabled($event)"
                />
              </label>
              <label
                class="flex min-h-16 items-center justify-between gap-4 py-3"
                [class.cursor-pointer]="current.delivery_enabled"
                [class.opacity-55]="!current.delivery_enabled"
              >
                <span>
                  <span class="block text-sm font-medium">Cash on delivery</span>
                  <span class="type-caption mt-0.5 block">
                    Invoice on dispatch and collect the exact balance.
                  </span>
                </span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary shrink-0"
                  [ngModel]="current.cod_enabled"
                  [disabled]="!current.delivery_enabled"
                  (ngModelChange)="updateDraft('cod_enabled', $event)"
                />
              </label>
            </div>

            @if (!current.pickup_enabled && !current.delivery_enabled) {
              <p class="text-sm text-error lg:col-start-2" role="alert">
                Choose at least one order method before saving.
              </p>
            }
          </section>

          <section
            class="grid gap-4 border-b border-base-300/70 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8"
          >
            <header>
              <h3 class="section-title">Pricing and promises</h3>
              <p class="type-caption mt-1">Set the fee and expected preparation time.</p>
            </header>

            <div class="grid gap-x-5 gap-y-5 sm:grid-cols-2">
              <label class="block sm:col-span-2" [class.opacity-55]="!current.delivery_enabled">
                <span class="mb-1 block text-sm font-medium">Delivery fee product</span>
                <select
                  class="select select-bordered min-h-11 w-full"
                  [class.select-error]="
                    current.delivery_enabled && !current.default_delivery_fee_variant_id
                  "
                  [ngModel]="current.default_delivery_fee_variant_id"
                  [disabled]="!current.delivery_enabled"
                  (ngModelChange)="updateDraft('default_delivery_fee_variant_id', $event)"
                >
                  <option [ngValue]="null">Choose a non-stock service</option>
                  @for (variant of feeVariants(); track variant.id) {
                    <option [value]="variant.id">
                      {{ variant.name }} | KES {{ money(variant.price) }}
                    </option>
                  }
                </select>
                @if (current.delivery_enabled && !current.default_delivery_fee_variant_id) {
                  <span class="mt-1 block text-xs text-error">
                    A delivery fee product is required when delivery is on.
                  </span>
                } @else {
                  <span class="type-caption mt-1 block">
                    Added to the cart using the product's normal price and tax rules.
                  </span>
                }
              </label>

              <label class="block">
                <span class="mb-1 block text-sm font-medium">Pickup promise</span>
                <div class="join flex">
                  <input
                    class="input input-bordered join-item min-h-11 min-w-0 flex-1"
                    [class.input-error]="!validMinutes(current.pickup_sla_minutes)"
                    type="number"
                    min="5"
                    max="10080"
                    inputmode="numeric"
                    [ngModel]="current.pickup_sla_minutes"
                    (ngModelChange)="updateMinutes('pickup_sla_minutes', $event)"
                  />
                  <span class="join-item flex items-center border border-base-300 px-3 text-sm">
                    min
                  </span>
                </div>
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-medium">Delivery promise</span>
                <div class="join flex">
                  <input
                    class="input input-bordered join-item min-h-11 min-w-0 flex-1"
                    [class.input-error]="!validMinutes(current.delivery_sla_minutes)"
                    type="number"
                    min="5"
                    max="10080"
                    inputmode="numeric"
                    [ngModel]="current.delivery_sla_minutes"
                    (ngModelChange)="updateMinutes('delivery_sla_minutes', $event)"
                  />
                  <span class="join-item flex items-center border border-base-300 px-3 text-sm">
                    min
                  </span>
                </div>
              </label>
              @if (
                !validMinutes(current.pickup_sla_minutes) ||
                !validMinutes(current.delivery_sla_minutes)
              ) {
                <p class="text-xs text-error sm:col-span-2" role="alert">
                  Promises must be between 5 minutes and 7 days.
                </p>
              }
            </div>
          </section>

          <section class="grid gap-4 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
            <header>
              <h3 class="section-title">Customer updates</h3>
              <p class="type-caption mt-1">Choose the channel and order milestones.</p>
              @if (!canConfigureMessages()) {
                <p class="mt-2 text-xs text-warning">
                  Manage communications permission is required to edit these settings.
                </p>
              }
            </header>

            <div [class.opacity-55]="!canConfigureMessages()">
              <div class="grid gap-5 sm:grid-cols-2">
                <label class="block">
                  <span class="mb-1 block text-sm font-medium">Primary channel</span>
                  <select
                    class="select select-bordered min-h-11 w-full"
                    [ngModel]="current.notification_channel"
                    [disabled]="!canConfigureMessages()"
                    (ngModelChange)="updateDraft('notification_channel', $event)"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                  </select>
                </label>
                <label
                  class="flex min-h-11 items-center justify-between gap-3 self-end border-y border-base-300/70 py-2"
                  [class.cursor-pointer]="current.notification_channel === 'whatsapp'"
                  [class.opacity-55]="current.notification_channel !== 'whatsapp'"
                >
                  <span>
                    <span class="block text-sm font-medium">SMS fallback</span>
                    <span class="type-caption mt-0.5 block">Use SMS if WhatsApp cannot send.</span>
                  </span>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary shrink-0"
                    [ngModel]="current.sms_fallback"
                    [disabled]="
                      !canConfigureMessages() || current.notification_channel !== 'whatsapp'
                    "
                    (ngModelChange)="updateDraft('sms_fallback', $event)"
                  />
                </label>
              </div>

              <fieldset class="mt-5" [disabled]="!canConfigureMessages()">
                <legend class="text-sm font-medium">Send an update when the order is</legend>
                <div class="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  @for (milestone of milestones; track milestone.key) {
                    <label
                      class="flex min-h-10 cursor-pointer items-center gap-2 border-y border-base-300/70 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        [ngModel]="current[milestone.key]"
                        (ngModelChange)="updateDraft(milestone.key, $event)"
                      />
                      {{ milestone.label }}
                    </label>
                  }
                </div>
              </fieldset>
            </div>
          </section>
        </fieldset>

        @if (dirty() || message()) {
          <footer
            class="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-20 mt-2 flex flex-col gap-3 rounded-box border border-base-300/80 bg-base-100/95 px-4 py-3 shadow-overlay backdrop-blur sm:flex-row sm:items-center lg:bottom-3"
          >
            <div class="flex min-w-0 items-start gap-2 sm:mr-auto">
              @if (message()?.ok) {
                <app-icon name="heroCheckCircle" class="mt-0.5 text-success" />
              } @else if (message()) {
                <app-icon name="heroExclamationTriangle" class="mt-0.5 text-error" />
              } @else {
                <app-icon name="heroPencilSquare" class="mt-0.5 text-warning" />
              }
              <div class="min-w-0">
                <p
                  class="text-sm font-medium"
                  [class.text-success]="message()?.ok"
                  [class.text-error]="message() && !message()?.ok"
                  role="status"
                >
                  @if (message()) {
                    {{ message()?.text }}
                  } @else {
                    Unsaved changes for {{ locationName() }}
                  }
                </p>
                @if (dirty() && validationMessage(); as validation) {
                  <p class="type-caption mt-0.5 text-error">{{ validation }}</p>
                }
              </div>
            </div>

            @if (dirty()) {
              <div class="flex items-center justify-end gap-2">
                <button
                  appButton
                  variant="ghost"
                  type="button"
                  [disabled]="busy()"
                  (click)="resetDraft()"
                >
                  Discard
                </button>
                <button
                  appButton
                  type="button"
                  [loading]="busy()"
                  [disabled]="!valid()"
                  (click)="save()"
                >
                  Save changes
                </button>
              </div>
            }
          </footer>
        }
      } @else if (message()) {
        <div
          role="alert"
          class="mt-5 flex items-start justify-between gap-4 border-y border-error/35 bg-error/5 px-3 py-3 text-sm text-error"
        >
          <span>{{ message()?.text }}</span>
          <button appButton variant="outline" size="sm" type="button" (click)="load()">
            Retry
          </button>
        </div>
      }
    </div>

    @if (pendingLocationId()) {
      <dialog
        class="modal modal-open"
        aria-labelledby="location-change-title"
        (cancel)="$event.preventDefault(); cancelLocationChange()"
      >
        <div class="modal-box modal-box-scroll md:w-full md:max-w-md">
          <h3 id="location-change-title" class="type-heading">
            Save changes to {{ locationName() }}?
          </h3>
          <p class="type-caption mt-2">
            You have unsaved changes. Choose what to do before opening
            {{ locationName(pendingLocationId()) }}.
          </p>
          @if (message() && !message()?.ok) {
            <p class="mt-3 text-sm text-error" role="alert">{{ message()?.text }}</p>
          }
          <div class="modal-action mt-5 flex-wrap gap-2">
            <button
              appButton
              variant="ghost"
              type="button"
              [disabled]="busy()"
              (click)="cancelLocationChange()"
            >
              Keep editing
            </button>
            <button
              appButton
              variant="outline"
              type="button"
              [disabled]="busy()"
              (click)="discardAndSwitchLocation()"
            >
              Discard and switch
            </button>
            <button
              appButton
              type="button"
              [loading]="busy()"
              [disabled]="!valid()"
              (click)="saveAndSwitchLocation()"
            >
              Save and switch
            </button>
          </div>
        </div>
        <button
          class="modal-backdrop"
          type="button"
          aria-label="Keep editing"
          (click)="cancelLocationChange()"
        ></button>
      </dialog>
    }
  `,
})
export class FulfillmentSettingsComponent implements OnInit {
  private readonly fulfillment = inject(FulfillmentService);
  private readonly supabase = inject(SupabaseService);
  protected readonly locations = inject(LocationContextService);
  private readonly permissions = inject(PermissionsService);

  protected readonly settings = signal<FulfillmentSettings | null>(null);
  protected readonly draft = signal<FulfillmentSettings | null>(null);
  protected readonly locationId = signal<string | null>(null);
  protected readonly selectedLocationId = signal<string | null>(null);
  protected readonly pendingLocationId = signal<string | null>(null);
  protected readonly feeVariants = signal<FeeVariant[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly canConfigureMessages = computed(() =>
    this.permissions.has('ManageCommunications')
  );
  protected readonly milestones = [
    { key: 'notify_ready', label: 'Ready' },
    { key: 'notify_in_transit', label: 'In transit' },
    { key: 'notify_failed', label: 'Failed' },
    { key: 'notify_fulfilled', label: 'Fulfilled' },
  ] as const;
  protected readonly dirty = computed(() => {
    const current = this.settings();
    const draft = this.draft();
    return Boolean(
      current && draft && EDITABLE_SETTING_KEYS.some(key => current[key] !== draft[key])
    );
  });
  protected readonly validationMessage = computed(() => {
    const draft = this.draft();
    if (!draft) return null;
    if (!this.validMinutes(draft.pickup_sla_minutes)) {
      return 'Pickup promise must be between 5 minutes and 7 days.';
    }
    if (!this.validMinutes(draft.delivery_sla_minutes)) {
      return 'Delivery promise must be between 5 minutes and 7 days.';
    }
    if (!draft.enabled) return null;
    if (!draft.pickup_enabled && !draft.delivery_enabled) {
      return 'Choose pickup, delivery, or both.';
    }
    if (draft.delivery_enabled && !draft.default_delivery_fee_variant_id) {
      return 'Choose a delivery fee product.';
    }
    return null;
  });
  protected readonly valid = computed(() => this.validationMessage() === null);

  async ngOnInit(): Promise<void> {
    await this.locations.load();
    const locationId = this.locations.activeId() ?? this.locations.locations()[0]?.id ?? null;
    this.locationId.set(locationId);
    this.selectedLocationId.set(locationId);
    await Promise.all([this.load(), this.loadFeeVariants()]);
  }

  protected requestLocationChange(locationId: string): void {
    this.selectedLocationId.set(locationId);
    if (!locationId || locationId === this.locationId()) return;
    if (this.dirty()) {
      this.pendingLocationId.set(locationId);
      return;
    }
    void this.switchLocation(locationId);
  }

  protected cancelLocationChange(): void {
    this.pendingLocationId.set(null);
    this.selectedLocationId.set(this.locationId());
    this.message.set(null);
  }

  protected discardAndSwitchLocation(): void {
    const locationId = this.pendingLocationId();
    if (!locationId) return;
    this.pendingLocationId.set(null);
    void this.switchLocation(locationId);
  }

  protected async saveAndSwitchLocation(): Promise<void> {
    const locationId = this.pendingLocationId();
    if (!locationId || !(await this.save())) return;
    this.pendingLocationId.set(null);
    await this.switchLocation(locationId);
  }

  protected async load(): Promise<void> {
    const locationId = this.locationId();
    if (!locationId) return;
    this.loading.set(true);
    this.settings.set(null);
    this.draft.set(null);
    this.message.set(null);
    try {
      const settings = await this.fulfillment.settings(locationId);
      this.settings.set(settings);
      this.draft.set({ ...settings });
    } catch (error) {
      this.message.set({
        ok: false,
        text: error instanceof Error ? error.message : 'Settings could not load',
      });
    } finally {
      this.loading.set(false);
    }
  }

  private async switchLocation(locationId: string): Promise<void> {
    this.locationId.set(locationId);
    this.selectedLocationId.set(locationId);
    await this.load();
  }

  private async loadFeeVariants(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('product_variants')
      .select('id,name,price,products(name)')
      .eq('kind', 'service')
      .eq('track_inventory', false)
      .eq('active', true)
      .order('name')
      .limit(100);
    if (error) return;
    this.feeVariants.set(
      (
        data as unknown as Array<{
          id: string;
          name: string;
          price: number;
          products: { name: string } | null;
        }>
      ).map(row => ({
        id: row.id,
        name: row.products?.name
          ? `${row.products.name}${row.name === 'Default' ? '' : ` - ${row.name}`}`
          : row.name,
        price: row.price,
      }))
    );
  }

  protected resetDraft(): void {
    const current = this.settings();
    if (!current) return;
    this.draft.set({ ...current });
    this.message.set(null);
  }

  protected updateDraft(key: EditableSettingKey, value: unknown): void {
    this.draft.update(current =>
      current ? ({ ...current, [key]: value } as FulfillmentSettings) : null
    );
    this.message.set(null);
  }

  protected updateMinutes(
    key: 'pickup_sla_minutes' | 'delivery_sla_minutes',
    value: number | null
  ): void {
    this.updateDraft(key, value === null ? null : Number(value));
  }

  protected setDeliveryEnabled(enabled: boolean): void {
    this.draft.update(current =>
      current
        ? {
            ...current,
            delivery_enabled: enabled,
            cod_enabled: enabled ? current.cod_enabled : false,
          }
        : null
    );
    this.message.set(null);
  }

  protected validMinutes(value: number | null | undefined): boolean {
    const minutes = Number(value);
    return Number.isInteger(minutes) && minutes >= 5 && minutes <= 10080;
  }

  protected async save(): Promise<boolean> {
    const locationId = this.locationId();
    const draft = this.draft();
    if (!locationId || !draft || !this.valid() || !this.dirty()) return false;
    this.busy.set(true);
    this.message.set(null);
    try {
      const payload: Partial<FulfillmentSettings> = {
        enabled: draft.enabled,
        pickup_enabled: draft.pickup_enabled,
        delivery_enabled: draft.delivery_enabled,
        cod_enabled: draft.cod_enabled && draft.delivery_enabled,
        default_delivery_fee_variant_id: draft.delivery_enabled
          ? draft.default_delivery_fee_variant_id
          : null,
        pickup_sla_minutes: Number(draft.pickup_sla_minutes),
        delivery_sla_minutes: Number(draft.delivery_sla_minutes),
        tracking_token_ttl_days: draft.tracking_token_ttl_days,
      };
      if (this.canConfigureMessages()) {
        Object.assign(payload, {
          notification_channel: draft.notification_channel,
          sms_fallback: draft.sms_fallback,
          notify_ready: draft.notify_ready,
          notify_in_transit: draft.notify_in_transit,
          notify_failed: draft.notify_failed,
          notify_fulfilled: draft.notify_fulfilled,
        });
      }
      const saved = await this.fulfillment.updateSettings(locationId, payload);
      this.settings.set(saved);
      this.draft.set({ ...saved });
      this.message.set({ ok: true, text: `Changes saved for ${this.locationName()}` });
      return true;
    } catch (error) {
      this.message.set({ ok: false, text: error instanceof Error ? error.message : 'Save failed' });
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected locationName(locationId = this.locationId()): string {
    return (
      this.locations.locations().find(location => location.id === locationId)?.name ?? 'location'
    );
  }

  protected money(value: number): string {
    return Number(value).toLocaleString('en-KE');
  }
}

import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import {
  FulfillmentService,
  type CheckoutCustomerInput,
  type FulfillmentCheckoutInput,
  type FulfillmentSettings,
} from './fulfillment.service';

export type CheckoutMode = 'counter' | 'pickup' | 'delivery';

export interface CheckoutCustomerSummary {
  id: string;
  name: string;
  phone: string | null;
}

export interface FulfillmentCheckoutDraft {
  customer: CheckoutCustomerInput;
  fulfillment: FulfillmentCheckoutInput;
}

@Component({
  selector: 'app-fulfillment-checkout-fields',
  imports: [FormsModule, FormFieldComponent],
  template: `
    @if (settings()?.enabled && settings()?.feature_available) {
      <section class="border-t border-base-300/60 p-4" aria-labelledby="order-method-heading">
        <p id="order-method-heading" class="type-caption">Order method</p>
        <div class="mt-2 grid grid-cols-3 rounded-field bg-base-200 p-1">
          <button
            type="button"
            class="btn btn-sm border-0"
            [class.btn-ghost]="mode() !== 'counter'"
            [class.btn-neutral]="mode() === 'counter'"
            (click)="selectMode('counter')"
          >
            Counter
          </button>
          <button
            type="button"
            class="btn btn-sm border-0"
            [class.btn-ghost]="mode() !== 'pickup'"
            [class.btn-neutral]="mode() === 'pickup'"
            [disabled]="!settings()?.pickup_enabled"
            (click)="selectMode('pickup')"
          >
            Pickup
          </button>
          <button
            type="button"
            class="btn btn-sm border-0"
            [class.btn-ghost]="mode() !== 'delivery'"
            [class.btn-neutral]="mode() === 'delivery'"
            [disabled]="!settings()?.delivery_enabled"
            (click)="selectMode('delivery')"
          >
            Delivery
          </button>
        </div>

        @if (mode() !== 'counter') {
          <div class="mt-4 space-y-3">
            <app-form-field label="Recipient name" [required]="true">
              <input
                class="input input-bordered min-h-11 w-full"
                autocomplete="name"
                [ngModel]="recipientName()"
                (ngModelChange)="recipientName.set($event)"
              />
            </app-form-field>

            <app-form-field
              label="Phone"
              [required]="mode() === 'delivery' || updatesRequested()"
              [hint]="phoneHint()"
            >
              <input
                class="input input-bordered min-h-11 w-full"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                placeholder="0712 345 678"
                [ngModel]="phone()"
                (ngModelChange)="phoneChanged($event)"
              />
            </app-form-field>

            @if (!customer() && customerMatches().length > 0) {
              <div class="border-y border-base-300/60 py-2">
                <p class="type-caption">Existing customer with this phone</p>
                @for (match of customerMatches(); track match.id) {
                  <button
                    type="button"
                    class="mt-1 flex min-h-11 w-full items-center justify-between gap-3 rounded-field px-2 text-left hover:bg-base-200"
                    (click)="useCustomer(match)"
                  >
                    <span class="truncate text-sm font-medium">{{ match.display_name }}</span>
                    <span class="text-xs text-base-content/60">Use customer</span>
                  </button>
                }
              </div>
            }

            @if (mode() === 'delivery') {
              <app-form-field label="Delivery address" [required]="true">
                <textarea
                  class="textarea textarea-bordered min-h-20 w-full"
                  autocomplete="street-address"
                  [ngModel]="address()"
                  (ngModelChange)="address.set($event)"
                ></textarea>
              </app-form-field>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <app-form-field label="Landmark">
                  <input
                    class="input input-bordered min-h-11 w-full"
                    [ngModel]="landmark()"
                    (ngModelChange)="landmark.set($event)"
                  />
                </app-form-field>
                <app-form-field label="Map link">
                  <input
                    class="input input-bordered min-h-11 w-full"
                    type="url"
                    inputmode="url"
                    placeholder="https://maps.google.com/..."
                    [ngModel]="mapLink()"
                    (ngModelChange)="mapLink.set($event)"
                  />
                </app-form-field>
              </div>
              <app-form-field label="Delivery instructions">
                <textarea
                  class="textarea textarea-bordered min-h-16 w-full"
                  [ngModel]="handoffNotes()"
                  (ngModelChange)="handoffNotes.set($event)"
                ></textarea>
              </app-form-field>
            }

            <app-form-field label="Preparation notes">
              <textarea
                class="textarea textarea-bordered min-h-16 w-full"
                [ngModel]="preparationNotes()"
                (ngModelChange)="preparationNotes.set($event)"
              ></textarea>
            </app-form-field>

            <app-form-field label="Promised time">
              <input
                class="input input-bordered min-h-11 w-full"
                type="datetime-local"
                [ngModel]="promisedAt()"
                (ngModelChange)="promisedAt.set($event)"
              />
            </app-form-field>

            @if (mode() === 'delivery' && settings()?.cod_enabled) {
              <div
                class="grid grid-cols-2 rounded-field bg-base-200 p-1"
                role="group"
                aria-label="Collection at handoff"
              >
                <button
                  type="button"
                  class="btn btn-sm border-0"
                  [class.btn-ghost]="collectionKind() !== 'none'"
                  [class.btn-neutral]="collectionKind() === 'none'"
                  (click)="collectionKind.set('none')"
                >
                  No collection
                </button>
                <button
                  type="button"
                  class="btn btn-sm border-0"
                  [class.btn-ghost]="collectionKind() !== 'cod'"
                  [class.btn-neutral]="collectionKind() === 'cod'"
                  (click)="chooseCod()"
                >
                  Cash on delivery
                </button>
              </div>
            }

            <label
              class="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-y border-base-300/60 py-2"
            >
              <span>
                <span class="block text-sm font-medium">Send tracking updates</span>
                <span class="type-caption">Transactional updates only</span>
              </span>
              <input
                type="checkbox"
                class="toggle toggle-primary toggle-sm"
                [ngModel]="updatesRequested()"
                (ngModelChange)="updatesRequested.set($event)"
              />
            </label>

            @if (!customer()) {
              <label class="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                <span>
                  <span class="block text-sm font-medium">Save as customer</span>
                  <span class="type-caption">Campaigns and reminders stay off</span>
                </span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-sm"
                  [ngModel]="saveAsCustomer()"
                  (ngModelChange)="saveAsCustomer.set($event)"
                  [disabled]="collectionKind() === 'cod'"
                />
              </label>
            }

            @if (validationMessage(); as message) {
              <p class="text-sm text-error" role="alert">{{ message }}</p>
            }
          </div>
        }
      </section>
    }
  `,
})
export class FulfillmentCheckoutFieldsComponent {
  private readonly fulfillment = inject(FulfillmentService);

  readonly settings = input<FulfillmentSettings | null>(null);
  readonly customer = input<CheckoutCustomerSummary | null>(null);
  readonly modeChanged = output<CheckoutMode>();
  readonly customerSelected = output<string>();

  readonly mode = signal<CheckoutMode>('counter');
  readonly recipientName = signal('');
  readonly phone = signal('');
  readonly address = signal('');
  readonly landmark = signal('');
  readonly mapLink = signal('');
  readonly preparationNotes = signal('');
  readonly handoffNotes = signal('');
  readonly promisedAt = signal('');
  readonly collectionKind = signal<'none' | 'cod'>('none');
  readonly updatesRequested = signal(true);
  readonly saveAsCustomer = signal(true);
  readonly customerMatches = signal<Array<{ id: string; display_name: string; phone: string }>>([]);
  readonly validationMessage = signal<string | null>(null);
  readonly phoneHint = computed(() =>
    this.mode() === 'pickup' && !this.updatesRequested()
      ? 'Optional when tracking updates are off'
      : 'Used for tracking and delivery contact'
  );

  private matchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCustomerId: string | null = null;

  constructor() {
    effect(() => {
      const customer = this.customer();
      if (!customer || customer.id === this.lastCustomerId) return;
      this.lastCustomerId = customer.id;
      untracked(() => {
        this.recipientName.set(customer.name);
        this.phone.set(customer.phone ?? '');
        this.customerMatches.set([]);
      });
    });
  }

  selectMode(mode: CheckoutMode): void {
    if (mode === 'pickup' && !this.settings()?.pickup_enabled) return;
    if (mode === 'delivery' && !this.settings()?.delivery_enabled) return;
    this.mode.set(mode);
    if (mode !== 'delivery') this.collectionKind.set('none');
    if (mode !== 'counter' && !this.promisedAt()) this.setDefaultPromise(mode);
    const customer = this.customer();
    if (mode !== 'counter' && customer && !this.recipientName()) {
      this.recipientName.set(customer.name);
      this.phone.set(customer.phone ?? '');
    }
    this.validationMessage.set(null);
    this.modeChanged.emit(mode);
  }

  phoneChanged(value: string): void {
    this.phone.set(value);
    this.customerMatches.set([]);
    if (this.matchTimer) clearTimeout(this.matchTimer);
    if (this.customer() || !this.normalizedPhone(value)) return;
    this.matchTimer = setTimeout(() => {
      void this.fulfillment
        .matchCustomers(value)
        .then(matches => this.customerMatches.set(matches))
        .catch(() => this.customerMatches.set([]));
    }, 250);
  }

  useCustomer(match: { id: string; display_name: string; phone: string }): void {
    this.recipientName.set(match.display_name);
    this.phone.set(match.phone);
    this.customerMatches.set([]);
    this.customerSelected.emit(match.id);
  }

  chooseCod(): void {
    this.collectionKind.set('cod');
    this.saveAsCustomer.set(true);
    this.updatesRequested.set(true);
  }

  build(): FulfillmentCheckoutDraft | null {
    const mode = this.mode();
    if (mode === 'counter') return null;
    const error = this.validate();
    this.validationMessage.set(error);
    if (error) return null;
    const customer = this.customer();
    const promisedAt = this.promisedAt() ? new Date(this.promisedAt()).toISOString() : null;
    return {
      customer: {
        customer_id: customer?.id ?? null,
        name: customer?.name ?? this.recipientName().trim(),
        phone: this.normalizedPhone(this.phone()),
        save_as_customer: customer
          ? false
          : this.saveAsCustomer() || this.collectionKind() === 'cod',
      },
      fulfillment: {
        type: mode,
        collection_kind: this.collectionKind(),
        recipient_name: this.recipientName().trim(),
        phone: this.normalizedPhone(this.phone()),
        address: this.clean(this.address()),
        landmark: this.clean(this.landmark()),
        map_link: this.clean(this.mapLink()),
        preparation_notes: this.clean(this.preparationNotes()),
        handoff_notes: this.clean(this.handoffNotes()),
        promised_at: promisedAt,
        transactional_message_consent: this.updatesRequested(),
      },
    };
  }

  reset(): void {
    this.mode.set('counter');
    this.recipientName.set('');
    this.phone.set('');
    this.address.set('');
    this.landmark.set('');
    this.mapLink.set('');
    this.preparationNotes.set('');
    this.handoffNotes.set('');
    this.promisedAt.set('');
    this.collectionKind.set('none');
    this.updatesRequested.set(true);
    this.saveAsCustomer.set(true);
    this.customerMatches.set([]);
    this.validationMessage.set(null);
    this.lastCustomerId = null;
    this.modeChanged.emit('counter');
  }

  private validate(): string | null {
    if (!this.recipientName().trim()) return 'Enter the recipient name.';
    const phone = this.normalizedPhone(this.phone());
    if ((this.mode() === 'delivery' || this.updatesRequested()) && !phone) {
      return 'Enter a valid Kenyan mobile number.';
    }
    if (this.mode() === 'delivery' && !this.address().trim()) return 'Enter a delivery address.';
    if (this.collectionKind() === 'cod' && !phone) return 'COD requires a customer phone number.';
    if (this.mapLink().trim() && !/^https:\/\//i.test(this.mapLink().trim())) {
      return 'Map link must start with https://.';
    }
    return null;
  }

  private setDefaultPromise(mode: Exclude<CheckoutMode, 'counter'>): void {
    const minutes =
      mode === 'pickup'
        ? (this.settings()?.pickup_sla_minutes ?? 30)
        : (this.settings()?.delivery_sla_minutes ?? 60);
    const date = new Date(Date.now() + minutes * 60_000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    this.promisedAt.set(local.toISOString().slice(0, 16));
  }

  private normalizedPhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
    if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
    return null;
  }

  private clean(value: string): string | null {
    return value.trim() || null;
  }
}

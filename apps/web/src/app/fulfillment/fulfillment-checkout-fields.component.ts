import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { FormSectionComponent } from '../shared/ui/form-section.component';
import { IconComponent } from '../shared/ui/icon.component';
import { PreferenceRowComponent } from '../shared/ui/preference-row.component';
import { TaskDialogComponent } from '../shared/ui/task-dialog.component';
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
  delivery_address: string | null;
}

export interface FulfillmentCheckoutDraft {
  customer: CheckoutCustomerInput;
  fulfillment: FulfillmentCheckoutInput;
}

type DraftState = {
  mode: CheckoutMode;
  recipientName: string;
  phone: string;
  address: string;
  landmark: string;
  mapLink: string;
  preparationNotes: string;
  handoffNotes: string;
  promisedAt: string;
  collectionKind: 'none' | 'cod';
  updatesRequested: boolean;
  saveAsCustomer: boolean;
  saveDeliveryAddress: boolean;
  moreDetailsOpen: boolean;
  committed: boolean;
};

type ValidationKey = 'recipient' | 'phone' | 'address' | 'mapLink' | 'promisedAt';
type ValidationErrors = Partial<Record<ValidationKey, string>>;

@Component({
  selector: 'app-fulfillment-checkout-fields',
  imports: [
    FormsModule,
    ButtonComponent,
    FormFieldComponent,
    FormSectionComponent,
    IconComponent,
    PreferenceRowComponent,
    TaskDialogComponent,
  ],
  template: `
    @if (settings()?.enabled && settings()?.feature_available) {
      <app-task-dialog
        #detailsDialog
        [(open)]="detailsOpen"
        size="lg"
        [title]="mode() === 'delivery' ? 'Delivery details' : 'Pickup details'"
        [subtitle]="customer()?.name ?? 'Walk-in customer'"
        [dirty]="detailsDirty()"
        (closed)="cancelDetails()"
      >
        <app-form-section title="Recipient" description="Who should receive this order?">
          <div class="grid gap-3 md:grid-cols-2">
            <app-form-field
              label="Recipient name"
              [required]="true"
              [error]="validationErrors().recipient"
            >
              <input
                data-checkout-field="recipient"
                class="input input-bordered min-h-11 w-full"
                autocomplete="name"
                [ngModel]="recipientName()"
                (ngModelChange)="recipientName.set($event); clearError('recipient')"
              />
            </app-form-field>
            <app-form-field
              label="Phone"
              [required]="mode() === 'delivery' || updatesRequested()"
              [hint]="phoneHint()"
              [error]="validationErrors().phone"
            >
              <input
                data-checkout-field="phone"
                class="input input-bordered min-h-11 w-full"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                placeholder="0712 345 678"
                [ngModel]="phone()"
                (ngModelChange)="phoneChanged($event); clearError('phone')"
              />
            </app-form-field>
          </div>

          <app-preference-row
            class="mt-3 block"
            label="Status updates"
            description="Ready, dispatched, failed and delivered messages. The link and PIN are still sent once."
          >
            <input
              type="checkbox"
              class="toggle toggle-primary toggle-sm"
              [ngModel]="updatesRequested()"
              (ngModelChange)="updatesRequested.set($event)"
            />
          </app-preference-row>

          @if (!customer() && customerMatches().length > 0) {
            <div class="mt-3 border-y border-base-300/60 py-2">
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

          @if (!customer()) {
            <app-preference-row
              class="mt-3 block"
              label="Save as customer"
              description="Keep these details for future orders; campaigns stay off."
            >
              <input
                type="checkbox"
                class="toggle toggle-primary toggle-sm"
                [ngModel]="saveAsCustomer()"
                (ngModelChange)="saveAsCustomer.set($event)"
                [disabled]="collectionKind() === 'cod'"
              />
            </app-preference-row>
          }
        </app-form-section>

        @if (mode() === 'delivery') {
          <app-form-section title="Destination" description="Where should the order be delivered?">
            <app-form-field
              label="Delivery address"
              [required]="true"
              [error]="validationErrors().address"
              [hint]="addressHint()"
            >
              <textarea
                data-checkout-field="address"
                class="textarea textarea-bordered min-h-24 w-full"
                autocomplete="street-address"
                maxlength="500"
                [ngModel]="address()"
                (ngModelChange)="address.set($event); addressChanged(); clearError('address')"
              ></textarea>
            </app-form-field>

            @if (showAddressSavePreference()) {
              <app-preference-row
                class="mt-3 block"
                label="Use this address next time"
                [description]="'Update the saved delivery address for ' + customer()!.name + '.'"
              >
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-sm"
                  [ngModel]="saveDeliveryAddress()"
                  (ngModelChange)="saveDeliveryAddress.set($event)"
                />
              </app-preference-row>
            }
          </app-form-section>
        }

        <app-form-section title="Timing and collection">
          <div
            class="grid gap-3"
            [class.md:grid-cols-2]="mode() === 'delivery' && settings()?.cod_enabled"
          >
            <app-form-field label="Promised time" [error]="validationErrors().promisedAt">
              <input
                data-checkout-field="promisedAt"
                class="input input-bordered min-h-11 w-full"
                type="datetime-local"
                [ngModel]="promisedAt()"
                (ngModelChange)="promisedAt.set($event); clearError('promisedAt')"
              />
            </app-form-field>
            @if (mode() === 'delivery' && settings()?.cod_enabled) {
              <app-form-field label="Payment timing">
                <select
                  class="select select-bordered min-h-11 w-full"
                  [ngModel]="collectionKind()"
                  (ngModelChange)="setCollectionKind($event)"
                >
                  <option value="none">Pay before delivery</option>
                  <option value="cod">Collect on delivery</option>
                </select>
              </app-form-field>
            }
          </div>
        </app-form-section>

        <app-form-section title="Notes" description="Add only what this order needs.">
          <button
            appButton
            type="button"
            variant="outline"
            size="sm"
            [attr.aria-expanded]="moreDetailsOpen()"
            (click)="moreDetailsOpen.set(!moreDetailsOpen())"
          >
            <app-icon [name]="moreDetailsOpen() ? 'heroChevronUp' : 'heroChevronDown'" />
            {{ moreDetailsOpen() ? 'Hide additional details' : 'More delivery details' }}
          </button>
          @if (moreDetailsOpen()) {
            <div class="mt-3 space-y-3">
              @if (mode() === 'delivery') {
                <div class="grid gap-3 md:grid-cols-2">
                  <app-form-field label="Landmark">
                    <input
                      class="input input-bordered min-h-11 w-full"
                      [ngModel]="landmark()"
                      (ngModelChange)="landmark.set($event)"
                    />
                  </app-form-field>
                  <app-form-field label="Map link" [error]="validationErrors().mapLink">
                    <input
                      data-checkout-field="mapLink"
                      class="input input-bordered min-h-11 w-full"
                      type="url"
                      inputmode="url"
                      placeholder="https://maps.google.com/..."
                      [ngModel]="mapLink()"
                      (ngModelChange)="mapLink.set($event); clearError('mapLink')"
                    />
                  </app-form-field>
                </div>
                <app-form-field label="Delivery instructions" hint="Shown to the handoff team.">
                  <textarea
                    class="textarea textarea-bordered min-h-20 w-full"
                    [ngModel]="handoffNotes()"
                    (ngModelChange)="handoffNotes.set($event)"
                  ></textarea>
                </app-form-field>
              }
              <app-form-field
                label="Preparation notes"
                hint="Internal instructions for preparing this order."
              >
                <textarea
                  class="textarea textarea-bordered min-h-20 w-full"
                  [ngModel]="preparationNotes()"
                  (ngModelChange)="preparationNotes.set($event)"
                ></textarea>
              </app-form-field>
            </div>
          }
        </app-form-section>

        <div taskFooter class="flex items-center justify-end gap-2">
          <button appButton variant="ghost" type="button" (click)="detailsDialog.requestClose()">
            Cancel
          </button>
          <button appButton type="button" (click)="completeDetails()">Done</button>
        </div>
      </app-task-dialog>
    }
  `,
})
export class FulfillmentCheckoutFieldsComponent {
  private readonly fulfillment = inject(FulfillmentService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly settings = input<FulfillmentSettings | null>(null);
  readonly customer = input<CheckoutCustomerSummary | null>(null);
  readonly modeChanged = output<CheckoutMode>();
  readonly customerSelected = output<string>();

  readonly mode = signal<CheckoutMode>('counter');
  readonly detailsOpen = signal(false);
  readonly detailsCommitted = signal(false);
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
  readonly saveDeliveryAddress = signal(true);
  readonly moreDetailsOpen = signal(false);
  readonly customerMatches = signal<Array<{ id: string; display_name: string; phone: string }>>([]);
  readonly validationErrors = signal<ValidationErrors>({});
  readonly validationMessage = computed(() => Object.values(this.validationErrors())[0] ?? null);
  readonly phoneHint = computed(() =>
    this.mode() === 'pickup' && !this.updatesRequested()
      ? 'Optional when status updates are off.'
      : 'Used for delivery contact and the initial order link.'
  );
  readonly showAddressSavePreference = computed(() => {
    const saved = this.clean(this.customer()?.delivery_address ?? '');
    const entered = this.clean(this.address());
    return !!this.customer() && !!saved && !!entered && saved !== entered;
  });
  readonly addressHint = computed(() => {
    const customer = this.customer();
    if (!customer || this.showAddressSavePreference()) return undefined;
    return customer.delivery_address
      ? `Saved delivery address for ${customer.name}.`
      : `Saved for ${customer.name} when this order is placed.`;
  });
  readonly promiseLabel = computed(() => {
    const value = this.promisedAt();
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit' }).format(date);
  });
  readonly detailsDirty = computed(() => {
    if (!this.detailsOpen() || !this.dialogBaseline) return false;
    return JSON.stringify(this.captureState()) !== JSON.stringify(this.dialogBaseline);
  });

  private matchTimer: ReturnType<typeof setTimeout> | null = null;
  private matchSequence = 0;
  private lastCustomerId: string | null = null;
  private dialogBaseline: DraftState | null = null;

  constructor() {
    effect(() => {
      const customer = this.customer();
      if (!customer) {
        if (this.lastCustomerId !== null) {
          untracked(() => {
            this.recipientName.set('');
            this.phone.set('');
            this.address.set('');
            this.saveAsCustomer.set(true);
            this.saveDeliveryAddress.set(true);
            this.customerMatches.set([]);
            this.validationErrors.set({});
            this.detailsCommitted.set(false);
            this.matchSequence++;
          });
        }
        this.lastCustomerId = null;
        return;
      }
      if (customer.id === this.lastCustomerId) return;
      this.lastCustomerId = customer.id;
      untracked(() => {
        this.recipientName.set(customer.name);
        this.phone.set(customer.phone ?? '');
        if (this.mode() === 'delivery') this.address.set(customer.delivery_address ?? '');
        this.saveDeliveryAddress.set(true);
        this.customerMatches.set([]);
        this.detailsCommitted.set(false);
        this.matchSequence++;
      });
    });
  }

  modeEnabled(mode: CheckoutMode): boolean {
    if (mode === 'pickup') return !!this.settings()?.pickup_enabled;
    if (mode === 'delivery') return !!this.settings()?.delivery_enabled;
    return true;
  }

  selectMode(mode: CheckoutMode): void {
    if (!this.modeEnabled(mode)) return;
    if (mode === 'counter') {
      this.mode.set('counter');
      this.detailsCommitted.set(false);
      this.collectionKind.set('none');
      this.validationErrors.set({});
      this.modeChanged.emit('counter');
      return;
    }
    if (mode === this.mode() && this.detailsCommitted()) {
      this.openDetails();
      return;
    }
    this.dialogBaseline = this.captureState();
    this.mode.set(mode);
    this.detailsCommitted.set(false);
    if (mode !== 'delivery') this.collectionKind.set('none');
    if (!this.promisedAt()) this.setDefaultPromise(mode);
    const customer = this.customer();
    if (customer) {
      this.recipientName.set(customer.name);
      this.phone.set(customer.phone ?? '');
      if (mode === 'delivery') this.address.set(customer.delivery_address ?? '');
    }
    this.validationErrors.set({});
    this.detailsOpen.set(true);
  }

  openDetails(): void {
    this.dialogBaseline = this.captureState();
    this.validationErrors.set({});
    this.detailsOpen.set(true);
  }

  cancelDetails(): void {
    if (this.dialogBaseline) this.restoreState(this.dialogBaseline);
    this.dialogBaseline = null;
    this.validationErrors.set({});
    this.detailsOpen.set(false);
  }

  completeDetails(): void {
    const errors = this.validate();
    this.validationErrors.set(errors);
    const first = Object.keys(errors)[0] as ValidationKey | undefined;
    if (first) {
      requestAnimationFrame(() =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-checkout-field="${first}"]`)
          ?.focus({ preventScroll: false })
      );
      return;
    }
    this.detailsCommitted.set(true);
    this.dialogBaseline = null;
    this.detailsOpen.set(false);
    this.modeChanged.emit(this.mode());
  }

  phoneChanged(value: string): void {
    this.phone.set(value);
    this.customerMatches.set([]);
    const sequence = ++this.matchSequence;
    if (this.matchTimer) clearTimeout(this.matchTimer);
    if (this.customer() || !this.normalizedPhone(value)) return;
    this.matchTimer = setTimeout(() => {
      void this.fulfillment
        .matchCustomers(value)
        .then(matches => {
          if (sequence === this.matchSequence) this.customerMatches.set(matches);
        })
        .catch(() => {
          if (sequence === this.matchSequence) this.customerMatches.set([]);
        });
    }, 250);
  }

  useCustomer(match: { id: string; display_name: string; phone: string }): void {
    this.recipientName.set(match.display_name);
    this.phone.set(match.phone);
    this.customerMatches.set([]);
    this.matchSequence++;
    this.customerSelected.emit(match.id);
  }

  setCollectionKind(kind: 'none' | 'cod'): void {
    this.collectionKind.set(kind);
    if (kind === 'cod') {
      this.saveAsCustomer.set(true);
      this.saveDeliveryAddress.set(true);
    }
  }

  chooseCod(): void {
    this.setCollectionKind('cod');
  }

  addressChanged(): void {
    if (this.showAddressSavePreference()) this.saveDeliveryAddress.set(true);
  }

  build(): FulfillmentCheckoutDraft | null {
    const mode = this.mode();
    if (mode === 'counter') return null;
    const errors = this.validate();
    if (!this.detailsCommitted() || Object.keys(errors).length > 0) {
      this.openDetails();
      this.validationErrors.set(errors);
      const first = Object.keys(errors)[0] as ValidationKey | undefined;
      if (first) {
        requestAnimationFrame(() =>
          this.host.nativeElement
            .querySelector<HTMLElement>(`[data-checkout-field="${first}"]`)
            ?.focus()
        );
      }
      return null;
    }
    const customer = this.customer();
    const promisedAt = this.promisedAt() ? new Date(this.promisedAt()).toISOString() : null;
    const address = this.clean(this.address());
    const mustSaveCustomer = this.collectionKind() === 'cod';
    return {
      customer: {
        customer_id: customer?.id ?? null,
        name: customer?.name ?? this.recipientName().trim(),
        phone: this.normalizedPhone(this.phone()),
        save_as_customer: customer ? false : this.saveAsCustomer() || mustSaveCustomer,
        delivery_address: mode === 'delivery' ? address : null,
        save_delivery_address:
          mode === 'delivery' &&
          (mustSaveCustomer ||
            (!!customer && (!customer.delivery_address || this.saveDeliveryAddress())) ||
            (!customer && this.saveAsCustomer())),
      },
      fulfillment: {
        type: mode,
        collection_kind: this.collectionKind(),
        recipient_name: this.recipientName().trim(),
        phone: this.normalizedPhone(this.phone()),
        address,
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
    this.restoreState({
      mode: 'counter',
      recipientName: '',
      phone: '',
      address: '',
      landmark: '',
      mapLink: '',
      preparationNotes: '',
      handoffNotes: '',
      promisedAt: '',
      collectionKind: 'none',
      updatesRequested: true,
      saveAsCustomer: true,
      saveDeliveryAddress: true,
      moreDetailsOpen: false,
      committed: false,
    });
    this.detailsOpen.set(false);
    this.customerMatches.set([]);
    this.validationErrors.set({});
    this.lastCustomerId = null;
    this.dialogBaseline = null;
    this.modeChanged.emit('counter');
  }

  clearError(key: ValidationKey): void {
    if (!this.validationErrors()[key]) return;
    const errors = { ...this.validationErrors() };
    delete errors[key];
    this.validationErrors.set(errors);
  }

  private validate(): ValidationErrors {
    const errors: ValidationErrors = {};
    if (!this.recipientName().trim()) errors.recipient = 'Enter the recipient name.';
    const phone = this.normalizedPhone(this.phone());
    if ((this.mode() === 'delivery' || this.updatesRequested()) && !phone) {
      errors.phone = 'Enter a valid Kenyan mobile number.';
    }
    if (this.mode() === 'delivery' && !this.address().trim()) {
      errors.address = 'Enter a delivery address.';
    } else if (this.address().trim().length > 500) {
      errors.address = 'Keep the delivery address under 500 characters.';
    }
    if (this.mapLink().trim() && !/^https:\/\//i.test(this.mapLink().trim())) {
      errors.mapLink = 'Map link must start with https://.';
    }
    if (this.promisedAt() && Number.isNaN(new Date(this.promisedAt()).getTime())) {
      errors.promisedAt = 'Enter a valid promised time.';
    }
    return errors;
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

  private captureState(): DraftState {
    return {
      mode: this.mode(),
      recipientName: this.recipientName(),
      phone: this.phone(),
      address: this.address(),
      landmark: this.landmark(),
      mapLink: this.mapLink(),
      preparationNotes: this.preparationNotes(),
      handoffNotes: this.handoffNotes(),
      promisedAt: this.promisedAt(),
      collectionKind: this.collectionKind(),
      updatesRequested: this.updatesRequested(),
      saveAsCustomer: this.saveAsCustomer(),
      saveDeliveryAddress: this.saveDeliveryAddress(),
      moreDetailsOpen: this.moreDetailsOpen(),
      committed: this.detailsCommitted(),
    };
  }

  private restoreState(state: DraftState): void {
    this.mode.set(state.mode);
    this.recipientName.set(state.recipientName);
    this.phone.set(state.phone);
    this.address.set(state.address);
    this.landmark.set(state.landmark);
    this.mapLink.set(state.mapLink);
    this.preparationNotes.set(state.preparationNotes);
    this.handoffNotes.set(state.handoffNotes);
    this.promisedAt.set(state.promisedAt);
    this.collectionKind.set(state.collectionKind);
    this.updatesRequested.set(state.updatesRequested);
    this.saveAsCustomer.set(state.saveAsCustomer);
    this.saveDeliveryAddress.set(state.saveDeliveryAddress);
    this.moreDetailsOpen.set(state.moreDetailsOpen);
    this.detailsCommitted.set(state.committed);
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

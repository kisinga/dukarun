import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
  afterNextRender,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  acquisitionSource,
  enquiryIntent,
  type AcquisitionSource,
} from '../../../../../../packages/public-acquisition';
import { dukarunWhatsAppUrl } from '../../core/public-contact';
import {
  EMPTY_ENQUIRY,
  ENQUIRY_OPTIONS,
  enquiryErrors,
  qualifiedEnquiryMessage,
  type EnquiryField,
} from '../../core/qualified-enquiry';
import {
  PublicPricingService,
  type PublicBillingConfig,
  type PublicSubscriptionPlan,
} from '../public-pricing.service';

@Component({
  selector: 'app-qualified-enquiry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-base-200/60 py-12 sm:py-16" aria-labelledby="enquiry-heading">
      <div class="mkt-container grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <div class="lg:sticky lg:top-24">
          <span class="mkt-eyebrow">Find the right way to start</span>
          <h1 id="enquiry-heading" class="mkt-h1 mt-3">See how Dukarun fits your shop.</h1>
          <p class="mkt-lead mt-4">
            Tell us how you sell today. We will show you the relevant workflow or scope the setup
            and training you need.
          </p>
          <ol class="mt-6 space-y-3 text-sm leading-relaxed text-base-content/75">
            <li>
              <strong class="text-base-content">1. Tell us about your shop.</strong> A few details
              help us prepare.
            </li>
            <li>
              <strong class="text-base-content">2. Send your message on WhatsApp.</strong> You
              choose when to send it.
            </li>
            <li>
              <strong class="text-base-content">3. Agree the next step.</strong> A focused demo or a
              separately quoted setup.
            </li>
          </ol>
          <div
            class="mt-7 rounded-box border border-base-300 bg-base-100 p-5 text-sm leading-relaxed"
          >
            <strong class="block">Subscription and setup are separate</strong>
            @if (billing(); as config) {
              <p class="mt-2 mb-0">
                New-customer access: {{ kes(config.initialPurchasePrice) }} for
                {{ config.testingAccessMonths }}
                {{ config.testingAccessMonths === 1 ? 'month' : 'months' }} of
                {{ config.newCustomerTierName }} after approval.
              </p>
            }
            @if (entryPlan(); as plan) {
              <p class="mt-2 mb-0">
                {{ plan.name }} subscription: {{ kes(plan.price_monthly) }} per month.
              </p>
            } @else if (pricingLoaded()) {
              <p class="mt-2 mb-0">
                Please confirm the current subscription price with us on WhatsApp.
              </p>
            } @else {
              <p class="mt-2 mb-0">Loading the current subscription offer…</p>
            }
            <p class="mt-2 mb-0">
              Simple shops can start with a 30-minute orientation and five products. Data
              preparation, staff training and on-site visits are scoped separately; typical
              implementation engagements exceed KES 40,000.
            </p>
            <a
              href="/#pricing"
              class="link link-primary mt-3 inline-flex min-h-11 items-center font-semibold"
              >See current plans and limits</a
            >
          </div>
        </div>

        <!-- Answers have no native names, so default submission cannot put them in URLs. -->
        <form
          class="mkt-card min-w-0 p-5 sm:p-8"
          novalidate
          (submit)="continueOnWhatsApp($event)"
          aria-label="Demo or setup enquiry"
        >
          <fieldset>
            <legend class="font-semibold">What would you like?</legend>
            <div class="mt-3 grid grid-cols-2 gap-3">
              @for (option of intents; track option.value) {
                <label class="intent-option" [class.selected]="intent() === option.value">
                  <input
                    type="radio"
                    name="intent"
                    [value]="option.value"
                    [checked]="intent() === option.value"
                    [disabled]="!ready()"
                    (change)="intent.set(option.value)"
                  />
                  <span>{{ option.label }}</span>
                </label>
              }
            </div>
          </fieldset>

          <div class="mt-6">
            <label class="block text-sm font-semibold" for="enquiry-businessType"
              >Business type</label
            >
            <p id="business-hint" class="mt-1 mb-2 text-sm text-base-content/65">
              For example, an electricals shop, hardware shop or spare-parts shop.
            </p>
            <input
              id="enquiry-businessType"
              type="text"
              maxlength="80"
              autocomplete="off"
              class="enquiry-control"
              [value]="answers().businessType"
              [disabled]="!ready()"
              (input)="update('businessType', $any($event.target).value)"
              (blur)="touch('businessType')"
              [attr.aria-invalid]="errorFor('businessType') ? 'true' : null"
              [attr.aria-describedby]="
                errorFor('businessType')
                  ? 'business-hint enquiry-businessType-error'
                  : 'business-hint'
              "
              required
            />
            @if (errorFor('businessType'); as error) {
              <p id="enquiry-businessType-error" class="field-error">{{ error }}</p>
            }
          </div>

          <fieldset class="mt-5">
            <legend class="text-sm font-semibold">Business size</legend>
            <div class="mt-2 grid grid-cols-2 gap-3">
              @for (field of sizeFields; track field.key) {
                <div>
                  <label
                    [for]="'enquiry-' + field.key"
                    class="mb-2 block text-sm text-base-content/75"
                    >{{ field.label }}</label
                  >
                  <select
                    [id]="'enquiry-' + field.key"
                    class="enquiry-control"
                    [value]="answers()[field.key]"
                    [disabled]="!ready()"
                    (change)="update(field.key, $any($event.target).value)"
                    (blur)="touch(field.key)"
                    [attr.aria-invalid]="errorFor(field.key) ? 'true' : null"
                    [attr.aria-describedby]="
                      errorFor(field.key) ? 'enquiry-' + field.key + '-error' : null
                    "
                    required
                  >
                    <option value="">Choose</option>
                    @for (option of field.options; track option) {
                      <option [value]="option">{{ option }}</option>
                    }
                  </select>
                  @if (errorFor(field.key); as error) {
                    <p [id]="'enquiry-' + field.key + '-error'" class="field-error">{{ error }}</p>
                  }
                </div>
              }
            </div>
          </fieldset>

          @for (field of detailFields; track field.key) {
            <div class="mt-5">
              <label [for]="'enquiry-' + field.key" class="mb-2 block text-sm font-semibold">{{
                field.label
              }}</label>
              <select
                [id]="'enquiry-' + field.key"
                class="enquiry-control"
                [value]="answers()[field.key]"
                [disabled]="!ready()"
                (change)="update(field.key, $any($event.target).value)"
                (blur)="touch(field.key)"
                [attr.aria-invalid]="errorFor(field.key) ? 'true' : null"
                [attr.aria-describedby]="
                  errorFor(field.key) ? 'enquiry-' + field.key + '-error' : null
                "
                required
              >
                <option value="">Choose an option</option>
                @for (option of field.options; track option) {
                  <option [value]="option">{{ option }}</option>
                }
              </select>
              @if (errorFor(field.key); as error) {
                <p [id]="'enquiry-' + field.key + '-error'" class="field-error">{{ error }}</p>
              }
            </div>
          }

          <details class="mt-6 rounded-box border border-base-300 bg-base-200/40 p-4">
            <summary class="min-h-11 cursor-pointer text-sm font-semibold">
              Preview your WhatsApp message
            </summary>
            @if (valid()) {
              <pre class="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{{
                message()
              }}</pre>
            } @else {
              <p class="mt-2 mb-0 text-sm text-base-content/65">
                Complete the questions to prepare your message.
              </p>
            }
          </details>
          <button
            type="submit"
            class="btn whatsapp-action mt-6 min-h-12 w-full"
            [disabled]="!ready()"
          >
            Continue on WhatsApp
          </button>
          <button
            type="button"
            class="btn btn-outline mt-3 min-h-11 w-full"
            (click)="copyMessage()"
            [disabled]="!ready()"
          >
            Copy message instead
          </button>
          <p class="mt-3 mb-0 text-sm leading-relaxed text-base-content/65">
            The form prepares a message. Your enquiry reaches us only when you send it on WhatsApp.
            Your answers are not saved by this website.
          </p>
          <p class="mt-2 text-sm text-base-content/65">
            Direct WhatsApp and email options are also available below.
          </p>
          <p role="status" aria-live="polite" class="mt-2 mb-0 text-sm text-base-content/75">
            {{ notice() }}
          </p>
          @if (copyFallback()) {
            <label for="enquiry-copy" class="mt-3 block text-sm font-semibold"
              >Select and copy your message</label
            >
            <textarea
              id="enquiry-copy"
              class="enquiry-control mt-2"
              rows="10"
              readonly
              [value]="message()"
              (focus)="$any($event.target).select()"
            ></textarea>
          }
        </form>
      </div>
    </section>
  `,
  styles: `
    .enquiry-control {
      display: block;
      width: 100%;
      min-height: 2.75rem;
      border: 1px solid var(--color-base-300);
      border-radius: var(--radius-field);
      background: var(--color-base-100);
      color: var(--color-base-content);
      padding: 0.7rem 0.85rem;
      font: inherit;
    }
    .enquiry-control:focus-visible,
    .intent-option:focus-within {
      outline: 2px solid var(--color-primary);
      outline-offset: 3px;
    }
    .enquiry-control[aria-invalid='true'] {
      border-color: var(--color-error);
    }
    .field-error {
      margin: 0.4rem 0 0;
      color: var(--color-error);
      font-size: 0.875rem;
    }
    .intent-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 3rem;
      padding: 0.75rem;
      border: 1px solid var(--color-base-300);
      border-radius: var(--radius-field);
      font-size: 0.875rem;
      cursor: pointer;
    }
    .intent-option.selected {
      border-color: var(--color-primary);
      background: color-mix(in oklab, var(--color-primary) 7%, var(--color-base-100));
    }
    input[type='radio'] {
      accent-color: var(--color-primary);
    }
  `,
})
export class QualifiedEnquiryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly pricing = inject(PublicPricingService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly intent = signal<'demo' | 'setup'>('demo');
  protected readonly answers = signal({ ...EMPTY_ENQUIRY });
  protected readonly source = signal<AcquisitionSource>({ from: '/contact' });
  protected readonly touched = signal<EnquiryField[]>([]);
  protected readonly submitted = signal(false);
  protected readonly ready = signal(false);
  protected readonly notice = signal('');
  protected readonly copyFallback = signal(false);
  protected readonly billing = signal<PublicBillingConfig | null>(null);
  protected readonly plans = signal<PublicSubscriptionPlan[]>([]);
  protected readonly pricingLoaded = signal(false);
  protected readonly entryPlan = computed(
    () =>
      this.plans().find(plan => plan.code === this.billing()?.newCustomerTierCode) ??
      this.plans()[0] ??
      null
  );
  protected readonly errors = computed(() => enquiryErrors(this.answers()));
  protected readonly valid = computed(() => Object.keys(this.errors()).length === 0);
  protected readonly message = computed(() =>
    qualifiedEnquiryMessage(this.intent(), this.answers(), this.source())
  );
  protected readonly intents = [
    { value: 'demo', label: 'Request a demo' },
    { value: 'setup', label: 'Setup quote' },
  ] as const;
  protected readonly sizeFields = [
    { key: 'locations', label: 'Locations', options: ENQUIRY_OPTIONS.locations },
    { key: 'staff', label: 'Staff besides you', options: ENQUIRY_OPTIONS.staff },
  ] as const;
  protected readonly detailFields = [
    { key: 'need', label: 'What would you like to improve?', options: ENQUIRY_OPTIONS.need },
    { key: 'records', label: 'How do you keep records today?', options: ENQUIRY_OPTIONS.records },
    { key: 'timing', label: 'When would you like to start?', options: ENQUIRY_OPTIONS.timing },
    { key: 'assistance', label: 'What help might you need?', options: ENQUIRY_OPTIONS.assistance },
  ] as const;

  constructor() {
    afterNextRender(() => this.ready.set(true));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const search = new URLSearchParams();
      for (const key of params.keys) search.set(key, params.get(key) ?? '');
      this.intent.set(enquiryIntent(params.get('intent')));
      this.source.set(acquisitionSource(search));
    });
  }

  async ngOnInit(): Promise<void> {
    const [plans, billing] = await Promise.allSettled([
      this.pricing.activePlans(),
      this.pricing.billingConfig(),
    ]);
    if (plans.status === 'fulfilled') this.plans.set(plans.value);
    if (billing.status === 'fulfilled') this.billing.set(billing.value);
    this.pricingLoaded.set(true);
  }

  protected kes(value: number): string {
    return `KES ${value.toLocaleString('en-KE')}`;
  }
  protected update(field: EnquiryField, value: string): void {
    this.answers.update(input => ({ ...input, [field]: value }));
    this.notice.set('');
  }
  protected touch(field: EnquiryField): void {
    this.touched.update(fields => [...new Set([...fields, field])]);
  }
  protected errorFor(field: EnquiryField): string | undefined {
    return this.submitted() || this.touched().includes(field) ? this.errors()[field] : undefined;
  }
  private validate(): boolean {
    this.submitted.set(true);
    if (this.valid()) return true;
    this.notice.set('Complete the highlighted questions before continuing.');
    setTimeout(() =>
      this.element.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    );
    return false;
  }
  protected continueOnWhatsApp(event: Event): void {
    event.preventDefault();
    if (!this.validate() || !isPlatformBrowser(this.platformId)) return;
    window.open(dukarunWhatsAppUrl(this.message()), '_blank', 'noopener,noreferrer');
    this.notice.set(
      'Send the prepared message in WhatsApp. If it does not open, use Copy message instead.'
    );
  }
  protected async copyMessage(): Promise<void> {
    if (!this.validate() || !isPlatformBrowser(this.platformId)) return;
    try {
      await navigator.clipboard.writeText(this.message());
      this.notice.set('Message copied. Paste it into your conversation with Dukarun.');
      this.copyFallback.set(false);
    } catch {
      this.copyFallback.set(true);
      this.notice.set('Select the message below and copy it manually.');
      setTimeout(() =>
        this.element.nativeElement.querySelector<HTMLElement>('#enquiry-copy')?.focus()
      );
    }
  }
}

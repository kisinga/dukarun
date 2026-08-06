import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';
import { PublicPricingService, PublicSubscriptionPlan } from '../public-pricing.service';

interface DemoProduct {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly initials: string;
}

interface CartLine {
  readonly product: DemoProduct;
  readonly qty: number;
}

interface Feature {
  readonly icon: string;
  readonly title: string;
  readonly copy: string;
  readonly docId: string;
}

interface Faq {
  readonly question: string;
  readonly answer: string;
}

interface Testimonial {
  readonly quote: string;
  readonly author: string;
  readonly title: string;
}

/**
 * Public landing page. Every claim here maps to a shipped v2 feature —
 * no camera recognition, no public storefronts, no push notifications.
 * The till demo is fully client-side with fictional products and prices.
 */
@Component({
  selector: 'app-marketing-home',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Hero -->
    <section class="relative overflow-hidden bg-base-200/60">
      <div class="mkt-container flex flex-col items-center py-16 text-center sm:py-24">
        <span
          class="inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3 py-1"
        >
          <app-icon name="heroSparkles" size="sm" class="text-primary" />
          <span class="mkt-eyebrow">POS + books · Built for Kenyan shops</span>
        </span>
        <h1 class="mkt-display mt-6">
          Every shilling,<br />accounted for<span class="text-primary">.</span>
        </h1>
        <p class="mkt-lead mx-auto mt-5 max-w-xl">
          Sell by cash or M-Pesa, with or without internet. Every sale goes straight into a proper
          double-entry ledger, so your books are always up to date.
        </p>
        <div class="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a routerLink="/register" class="btn btn-primary btn-lg min-h-11">
            Get started
            <app-icon name="heroArrowRight" size="md" />
          </a>
          <a routerLink="/login" class="btn btn-outline btn-lg min-h-11">Log in</a>
        </div>
        <ul class="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-base-content/60">
          @for (point of trustPoints; track point) {
            <li class="flex items-center gap-1.5">
              <app-icon name="heroCheck" size="sm" class="text-primary" />
              {{ point }}
            </li>
          }
        </ul>
      </div>
    </section>

    <!-- Interactive till demo -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="demo-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">Live demo</span>
          <h2 id="demo-heading" class="mkt-h2 mt-2">Try the counter yourself</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            This is Jiko Kiosk, a fictional shop with fictional prices. Tap a few products, charge,
            and watch the receipt print.
          </p>
        </div>

        <div class="card mx-auto mt-10 max-w-4xl p-4 sm:p-6">
          <div class="flex flex-wrap items-center gap-2 pb-4">
            <span class="badge badge-primary font-semibold">Jiko Kiosk</span>
            <span class="text-sm text-base-content/60">Morning shift · Cashier: Wanjiru</span>
            <span class="ml-auto flex items-center gap-1 text-xs text-base-content/60">
              <app-icon name="heroSignalSlash" size="sm" />
              works offline
            </span>
          </div>

          <div class="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
            <!-- Products -->
            <div class="grid grid-cols-3 content-start gap-2">
              @for (product of products; track product.id) {
                <button
                  type="button"
                  (click)="addToCart(product)"
                  [attr.aria-label]="'Add ' + product.name + ' for KES ' + product.price"
                  class="relative flex min-h-11 flex-col items-start gap-1.5 rounded-field border border-base-300/60 bg-base-200/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-base-200 active:scale-95"
                >
                  <span
                    class="flex h-8 w-8 items-center justify-center rounded-selector bg-primary/10 text-xs font-bold text-primary"
                  >
                    {{ product.initials }}
                  </span>
                  <span class="text-xs font-medium leading-tight">{{ product.name }}</span>
                  <span class="text-sm font-bold tabular-nums">{{ kes(product.price) }}</span>
                  @if (qtyOf(product.id) > 0) {
                    <span
                      class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-content"
                    >
                      {{ qtyOf(product.id) }}
                    </span>
                  }
                </button>
              }
            </div>

            <!-- Cart / receipt -->
            <div
              class="flex min-h-64 flex-col rounded-box border border-base-300/60 bg-base-100 p-4"
            >
              @if (!paid()) {
                <div class="flex-1">
                  @if (cart().size === 0) {
                    <div
                      class="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-base-content/40"
                    >
                      <app-icon name="heroShoppingCart" size="xl" />
                      <p class="mb-0 text-xs">Tap a product to start a sale.</p>
                    </div>
                  } @else {
                    <ul class="flex flex-col divide-y divide-base-300/60">
                      @for (line of cartLines(); track line.product.id) {
                        <li class="flex items-baseline justify-between gap-2 py-1.5 text-sm">
                          <span class="min-w-0 truncate">
                            {{ line.product.name }}
                            <span class="text-base-content/50">× {{ line.qty }}</span>
                          </span>
                          <span class="shrink-0 font-semibold tabular-nums">
                            {{ (line.product.price * line.qty).toLocaleString('en-KE') }}
                          </span>
                        </li>
                      }
                    </ul>
                  }
                </div>
                <div class="mt-3 border-t border-base-300/60 pt-3">
                  <div class="flex items-baseline justify-between font-bold" aria-live="polite">
                    <span>Total</span>
                    <span class="tabular-nums">{{ kes(cartTotal()) }}</span>
                  </div>
                  <button
                    type="button"
                    (click)="charge()"
                    [disabled]="cart().size === 0"
                    class="btn btn-primary mt-3 w-full min-h-11"
                  >
                    Charge with M-Pesa
                  </button>
                  @if (cart().size > 0) {
                    <button
                      type="button"
                      (click)="clearCart()"
                      class="mt-1.5 w-full text-center text-xs text-base-content/50 hover:text-base-content/80"
                    >
                      Clear sale
                    </button>
                  }
                </div>
              } @else {
                <!-- Receipt -->
                <div class="flex flex-1 flex-col">
                  <div class="receipt-edge receipt-edge-up shrink-0" aria-hidden="true"></div>
                  <div class="receipt flex-1 px-4 py-3 font-mono text-sm">
                    <p class="mb-0 text-center text-xs font-bold tracking-widest">
                      JIKO KIOSK · DEMO SALE
                    </p>
                    <p class="mb-0 mt-0.5 text-center text-xs opacity-60">
                      Cashier: Wanjiru · Session 014
                    </p>
                    <div class="my-2 border-t border-dashed border-current opacity-40"></div>
                    <ul>
                      @for (line of paid()!.lines; track line.product.id) {
                        <li class="flex justify-between gap-2 py-0.5 text-xs">
                          <span class="uppercase">{{ line.product.name }} ×{{ line.qty }}</span>
                          <span class="tabular-nums">
                            {{ (line.product.price * line.qty).toLocaleString('en-KE') }}
                          </span>
                        </li>
                      }
                    </ul>
                    <div class="my-2 border-t border-dashed border-current opacity-40"></div>
                    <p class="mb-0 flex justify-between text-sm font-bold">
                      <span>TOTAL</span>
                      <span class="tabular-nums">{{ kes(paid()!.total) }}</span>
                    </p>
                    <p class="mb-0 mt-2 flex items-center gap-1 text-xs font-bold text-success">
                      <app-icon name="heroCheckCircle" size="sm" />
                      M-PESA CONFIRMED · POSTED TO LEDGER
                    </p>
                    <div class="receipt-barcode mt-3 opacity-70" aria-hidden="true"></div>
                    <p class="mb-0 mt-1.5 text-center text-xs opacity-60">Asante · dukarun</p>
                  </div>
                  <div class="receipt-edge shrink-0" aria-hidden="true"></div>
                  <div class="mt-3 flex flex-col gap-1.5">
                    <a routerLink="/register" class="btn btn-primary btn-sm w-full min-h-11">
                      Make it yours. Get started
                    </a>
                    <button
                      type="button"
                      (click)="resetDemo()"
                      class="w-full text-center text-xs text-base-content/50 hover:text-base-content/80"
                    >
                      Sell again
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
          <p class="mt-4 text-center text-xs text-base-content/50">
            Nothing to type. The sale is already in the books.
          </p>
        </div>
      </div>
    </section>

    <!-- Customer voices -->
    <section class="bg-base-200/60 py-14 sm:py-20" aria-labelledby="voices-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">Word of mouth</span>
          <h2 id="voices-heading" class="mkt-h2 mt-2">From the shops that run on dukarun</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">Three shopkeepers, in their own words.</p>
        </div>

        <div class="mx-auto mt-10 max-w-md">
          <div class="receipt-edge receipt-edge-up" aria-hidden="true"></div>
          <div class="receipt px-6 py-6 font-mono shadow-overlay sm:px-8 sm:py-8">
            <p class="mb-0 text-center text-xs font-bold tracking-widest">DUKARUN</p>
            <p class="mb-0 mt-1 text-center text-xs uppercase tracking-widest opacity-60">
              Customer voices · Kenya
            </p>
            <div class="my-4 border-t border-dashed border-current opacity-40"></div>

            @for (t of testimonials; track t.author; let last = $last) {
              <blockquote class="mb-0 text-sm leading-relaxed">"{{ t.quote }}"</blockquote>
              <p class="mb-0 mt-2 text-xs uppercase tracking-wider opacity-60">
                {{ t.author }} · {{ t.title }}
              </p>
              @if (!last) {
                <div class="my-4 border-t border-dashed border-current opacity-40"></div>
              }
            }

            <div class="my-4 border-t border-dashed border-current opacity-40"></div>
            <p class="mb-0 text-center text-xs uppercase tracking-widest opacity-60">Asante sana</p>
          </div>
          <div class="receipt-edge" aria-hidden="true"></div>
        </div>
      </div>
    </section>

    <!-- Three questions -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="questions-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">At closing time</span>
          <h2 id="questions-heading" class="mkt-h2 mt-2">
            Three questions your books should answer
          </h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            When the doors close, these are the questions that matter. A notebook can't answer them;
            your ledger can.
          </p>
        </div>
        <div class="mt-10 grid gap-4 md:grid-cols-3">
          @for (q of closingQuestions; track q.question) {
            <article class="mkt-card flex flex-col gap-3 p-6">
              <span
                class="flex h-11 w-11 items-center justify-center rounded-field bg-primary/10 text-primary"
              >
                <app-icon [name]="q.icon" size="lg" />
              </span>
              <h3 class="text-lg font-semibold">{{ q.question }}</h3>
              <p class="mb-0 text-sm text-base-content/70">{{ q.answer }}</p>
            </article>
          }
        </div>
        <p class="mt-8 text-center font-semibold text-primary">
          Real numbers from your own books, so you can go home sure.
        </p>
      </div>
    </section>

    <!-- Features -->
    <section class="bg-base-200/60 py-14 sm:py-20" aria-labelledby="features-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">What's inside</span>
          <h2 id="features-heading" class="mkt-h2 mt-2">One app for the whole shop</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            Here are some featured capabilities of dukarun.
          </p>
        </div>
        <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          @for (feature of features; track feature.title) {
            <a
              routerLink="/docs"
              [fragment]="feature.docId"
              class="mkt-card flex flex-col gap-3 p-5"
              [attr.aria-label]="feature.title + ' — read the documentation'"
            >
              <span
                class="flex h-10 w-10 items-center justify-center rounded-field bg-primary/10 text-primary"
              >
                <app-icon [name]="feature.icon" size="lg" />
              </span>
              <h3 class="font-semibold">{{ feature.title }}</h3>
              <p class="mb-0 text-sm text-base-content/70">{{ feature.copy }}</p>
              <span class="mt-auto flex items-center gap-1 text-xs font-semibold text-primary">
                Read the docs
                <app-icon name="heroArrowRight" size="sm" />
              </span>
            </a>
          }
        </div>
        <div class="mt-10 flex justify-center">
          <a routerLink="/docs" class="btn btn-outline min-h-11">
            See every feature in the docs
            <app-icon name="heroArrowRight" size="md" />
          </a>
        </div>
      </div>
    </section>

    <!-- A day at the duka -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="day-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">A day at the duka</span>
          <h2 id="day-heading" class="mkt-h2 mt-2">Open to close</h2>
        </div>
        <ol class="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            aria-hidden="true"
            class="absolute bottom-2 left-5 top-2 w-px bg-primary/25 md:bottom-auto md:left-0 md:right-0 md:top-5 md:h-px md:w-auto"
          ></span>
          @for (scene of scenes; track scene.time) {
            <li class="relative pl-16 md:pl-0 md:pt-14">
              <span
                class="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-base-100 text-primary"
              >
                <app-icon [name]="scene.icon" size="md" />
              </span>
              <span class="text-sm font-bold tabular-nums tracking-widest text-primary">
                {{ scene.time }}
              </span>
              <h3 class="mt-1 text-lg font-semibold">{{ scene.title }}</h3>
              <p class="mt-1 mb-0 text-sm text-base-content/70">{{ scene.copy }}</p>
            </li>
          }
        </ol>
      </div>
    </section>

    <!-- Pricing -->
    <section
      id="pricing"
      class="scroll-mt-20 bg-base-200/60 py-14 sm:py-20"
      aria-labelledby="pricing-heading"
    >
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">Simple pricing</span>
          <h2 id="pricing-heading" class="mkt-h2 mt-2">Choose the plan that fits your shop</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            Compare the available plans, then pay monthly or save with yearly billing.
          </p>
        </div>

        @if (pricingLoading()) {
          <div class="mkt-card mx-auto mt-10 max-w-4xl animate-pulse p-6 sm:p-8">
            <div class="h-5 w-28 rounded bg-base-300"></div>
            <div class="mt-4 h-10 w-52 rounded bg-base-300"></div>
            <div class="mt-8 grid gap-3 sm:grid-cols-2">
              <div class="h-4 rounded bg-base-300"></div>
              <div class="h-4 rounded bg-base-300"></div>
            </div>
          </div>
        } @else if (pricingPlans().length > 0) {
          <div class="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-3">
            @for (plan of pricingPlans(); track plan.id) {
              <article class="mkt-card flex flex-col p-6 sm:p-7">
                <h3 class="text-xl font-semibold">{{ plan.name }}</h3>
                <div class="mt-4 flex items-end gap-2">
                  <strong class="mkt-h2 tabular-nums">{{ kes(plan.price_monthly) }}</strong>
                  <span class="pb-1 text-sm text-base-content/60">/ month</span>
                </div>
                <p class="mt-2 mb-0 min-h-10 text-sm text-base-content/70">
                  {{ kes(plan.price_yearly) }} per year
                  @if (yearlySaving(plan) > 0) {
                    <span class="font-semibold text-primary">
                      — save {{ kes(yearlySaving(plan)) }}
                    </span>
                  }
                </p>

                <div class="my-5 border-t border-base-300/60"></div>
                <p class="text-sm font-semibold">Plan includes</p>
                <ul class="mt-3 flex flex-col gap-2.5 text-sm">
                  @for (feature of planFeatures(plan); track feature) {
                    <li class="flex items-start gap-2">
                      <app-icon
                        name="heroCheckCircle"
                        size="md"
                        class="mt-0.5 shrink-0 text-primary"
                      />
                      <span>{{ feature }}</span>
                    </li>
                  }
                </ul>

                <a routerLink="/register" class="btn btn-primary mt-6 min-h-11 w-full">
                  Start with {{ plan.name }}
                  <app-icon name="heroArrowRight" size="md" />
                </a>
              </article>
            }
          </div>
          <p class="mt-5 mb-0 text-center text-xs text-base-content/60">
            No card or special hardware required. Pay by M-Pesa when the trial ends.
          </p>
        } @else {
          <div
            class="mx-auto mt-10 max-w-xl rounded-box border border-base-300 bg-base-100 p-6 text-center"
          >
            <h3 class="font-semibold">Pricing is temporarily unavailable</h3>
            <p class="mt-2 mb-0 text-sm text-base-content/70">
              Please <a routerLink="/contact" class="link link-primary">contact us</a> for the
              current price.
            </p>
          </div>
        }
      </div>
    </section>

    <!-- FAQ -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="faq-heading">
      <div class="mkt-container max-w-3xl">
        <div class="text-center">
          <span class="mkt-eyebrow">Questions</span>
          <h2 id="faq-heading" class="mkt-h2 mt-2">Straight answers</h2>
        </div>
        <div class="mt-8 flex flex-col gap-3">
          @for (faq of faqs; track faq.question) {
            <div class="collapse collapse-arrow rounded-box border border-base-300/60 bg-base-100">
              <input type="checkbox" [id]="'faq-' + $index" />
              <div class="collapse-title flex items-baseline gap-3 font-semibold">
                <span class="text-sm font-bold tabular-nums text-primary">0{{ $index + 1 }}</span>
                {{ faq.question }}
              </div>
              <div class="collapse-content text-sm text-base-content/70">
                <p class="mb-0">{{ faq.answer }}</p>
              </div>
            </div>
          }
        </div>
        <p class="mt-8 text-center text-sm text-base-content/70">
          Still curious? Read the
          <a routerLink="/docs" class="link link-primary font-medium">getting-started guide</a>
          or <a routerLink="/contact" class="link link-primary font-medium">talk to us</a>.
        </p>
      </div>
    </section>

    <!-- Closer -->
    <section class="bg-primary text-primary-content">
      <div class="mkt-container py-16 text-center sm:py-24">
        <h2 class="mkt-h1">Balance your books tonight.</h2>
        <p class="mx-auto mt-4 max-w-xl text-primary-content/85">
          Set up in the morning, sell by lunch, and close the day with the books already balanced.
        </p>
        <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            routerLink="/register"
            class="btn btn-lg min-h-11 border-white bg-white text-primary hover:bg-white/90"
          >
            Get started
            <app-icon name="heroArrowRight" size="md" />
          </a>
          <a
            routerLink="/contact"
            class="btn btn-lg btn-outline min-h-11 border-white/70 text-white hover:bg-white/10"
          >
            Talk to us first
          </a>
        </div>
        <p class="mt-6 text-xs text-primary-content/70">
          No hardware · Works offline · Cancel anytime
        </p>
      </div>
    </section>
  `,
})
export class HomeComponent implements OnInit {
  private readonly publicPricing = inject(PublicPricingService);

  protected readonly pricingPlans = signal<PublicSubscriptionPlan[]>([]);
  protected readonly pricingLoading = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      this.pricingPlans.set(await this.publicPricing.activePlans());
    } catch {
      this.pricingPlans.set([]);
    } finally {
      this.pricingLoading.set(false);
    }
  }

  protected readonly trustPoints = ['No hardware needed', 'Works offline', 'Cancel anytime'];

  protected readonly products: DemoProduct[] = [
    { id: 'unga', name: 'Unga wa Dola 2kg', price: 185, initials: 'UD' },
    { id: 'mafuta', name: 'Mafuta 1L', price: 340, initials: 'MF' },
    { id: 'sugar', name: 'Sugar 1kg', price: 165, initials: 'SG' },
    { id: 'airtime', name: 'Airtime 100', price: 100, initials: 'AT' },
    { id: 'milk', name: 'Milk 500ml', price: 60, initials: 'MK' },
    { id: 'bread', name: 'Bread 400g', price: 65, initials: 'BR' },
  ];

  protected readonly cart = signal(new Map<string, number>());
  protected readonly paid = signal<{ lines: CartLine[]; total: number } | null>(null);

  protected readonly cartLines = computed<CartLine[]>(() =>
    this.products
      .filter(p => (this.cart().get(p.id) ?? 0) > 0)
      .map(p => ({ product: p, qty: this.cart().get(p.id)! }))
  );

  protected readonly cartTotal = computed(() =>
    this.cartLines().reduce((sum, l) => sum + l.product.price * l.qty, 0)
  );

  protected qtyOf(id: string): number {
    return this.cart().get(id) ?? 0;
  }

  protected kes(amount: number): string {
    return `KES ${amount.toLocaleString('en-KE')}`;
  }

  protected yearlySaving(plan: PublicSubscriptionPlan): number {
    return Math.max(0, plan.price_monthly * 12 - plan.price_yearly);
  }

  protected planFeatures(plan: PublicSubscriptionPlan): string[] {
    const features: string[] = [];
    if (plan.max_team_members !== null) features.push(`${plan.max_team_members} team members`);
    if (plan.max_products !== null)
      features.push(`${plan.max_products.toLocaleString('en-KE')} products`);
    if (plan.max_stock_locations !== null)
      features.push(`${plan.max_stock_locations} stock locations`);
    if (plan.max_orders_per_month !== null)
      features.push(`${plan.max_orders_per_month.toLocaleString('en-KE')} sales per month`);
    if (plan.sms_per_period !== null)
      features.push(`${plan.sms_per_period.toLocaleString('en-KE')} SMS per month`);
    if (plan.staff_performance_enabled) features.push('Staff performance reports');
    if (plan.commissions_available) features.push('Sales commissions');
    if (plan.multiple_locations_enabled && plan.max_stock_locations === null)
      features.push('Multiple stock locations');
    return features;
  }

  protected addToCart(product: DemoProduct): void {
    this.paid.set(null);
    const next = new Map(this.cart());
    next.set(product.id, (next.get(product.id) ?? 0) + 1);
    this.cart.set(next);
  }

  protected clearCart(): void {
    this.cart.set(new Map());
  }

  protected charge(): void {
    if (this.cart().size === 0) return;
    this.paid.set({ lines: this.cartLines(), total: this.cartTotal() });
    this.cart.set(new Map());
  }

  protected resetDemo(): void {
    this.paid.set(null);
  }

  protected readonly closingQuestions = [
    {
      icon: 'heroChartBar',
      question: 'How much did make this month?',
      answer:
        'Every sale and expense posts to a double-entry ledger, so profit is accurate. You can even track profit per batch, per product or duration. This and much more',
    },
    {
      icon: 'heroUsers',
      question: 'Who still owes me, and how much?',
      answer:
        'Customer credit is tracked per person, with balances and payment history. No more flipping through the notebook under the counter.',
    },
    {
      icon: 'heroCube',
      question: 'What should I restock tomorrow?',
      answer:
        'Stock updates with every sale, and batch and expiry dates show you what to move first and what to reorder.',
    },
  ];

  protected readonly testimonials: Testimonial[] = [
    {
      quote:
        'I finally know my exact stock, down to the last packet, without counting shelves at night.',
      author: 'Amina K.',
      title: 'Mini Mart · Nairobi',
    },
    {
      quote: 'Offline mode is a lifesaver during power cuts. Sales sync perfectly later.',
      author: 'David M.',
      title: 'Agrovet · Nakuru',
    },
    {
      quote: 'The whole salon picked it up in one morning. Tracking sales is simple now.',
      author: 'Grace W.',
      title: 'Salon · Mombasa',
    },
  ];

  protected readonly features: Feature[] = [
    {
      icon: 'heroShoppingCart',
      title: 'Point of sale',
      copy: 'Tap a product, take cash or M-Pesa, hand over the receipt. The counter screen is built for a phone in one hand.',
      docId: 'pos',
    },
    {
      icon: 'heroSignalSlash',
      title: 'Offline selling',
      copy: 'Keep selling when the network drops. Sales wait safely and sync on their own when you are back online.',
      docId: 'offline',
    },
    {
      icon: 'heroUsers',
      title: 'Customer credit',
      copy: 'Sell on credit to the customers you trust, with every balance and payment on record per person.',
      docId: 'credit',
    },
    {
      icon: 'heroClipboardDocumentList',
      title: 'Double-entry ledger',
      copy: 'Every transaction posts debit and credit, so your reports always balance.',
      docId: 'ledger',
    },
  ];

  protected readonly scenes = [
    {
      time: '07:30',
      icon: 'heroLockOpen',
      title: 'Open the shop',
      copy: 'The cashier starts a session and counts the float. Yesterday closed balanced, so today starts clean.',
    },
    {
      time: '13:00',
      icon: 'heroSignalSlash',
      title: 'Lunch rush, no network',
      copy: 'The internet drops and nobody at the counter notices. Sales keep going through and wait safely on the phone until the signal comes back.',
    },
    {
      time: '19:45',
      icon: 'heroLockClosed',
      title: 'Close in minutes',
      copy: 'Count the drawer and match it against the session. The numbers already agree, so posting the day takes minutes.',
    },
  ];

  protected readonly faqs: Faq[] = [
    {
      question: 'What happens when my internet drops?',
      answer:
        'Nothing changes at the counter. The POS keeps selling and queues every sale on the device, then syncs when the network returns. Safeguards make sure no sale is ever posted twice.',
    },
    {
      question: 'Do I need special hardware?',
      answer:
        'No. Dukarun runs on the Android phone you already have, and on any desktop browser for the back office. Any Bluetooth or USB receipt printer works if you want paper.',
    },
    {
      question: 'How do my customers pay?',
      answer:
        'Cash or M-Pesa, recorded at the till. You can also sell on credit to customers you trust, with balances and limits tracked per person.',
    },
    {
      question: 'Can customers pay straight into dukarun by M-Pesa?',
      answer:
        'Not yet. Customer-initiated M-Pesa (an STK push from the buyer) is still in the works. Today you record M-Pesa payments from your existing till, and they post to the books like any other sale.',
    },
    {
      question: 'Can my staff use it without seeing everything?',
      answer:
        'Yes. Cashiers sell; managers approve; owners see the books. Roles decide what each person can do, and sensitive actions like price overrides or stock adjustments can require approval.',
    },
    {
      question: 'How is the subscription billed?',
      answer:
        'Monthly or yearly, through M-Pesa. You get a prompt on your phone, approve it, and you are done.',
    },
  ];
}

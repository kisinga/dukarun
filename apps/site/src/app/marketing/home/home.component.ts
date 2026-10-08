import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { IconComponent } from '../../shared/ui/icon.component';
import { MarketingVideoComponent } from '../marketing-video.component';
import {
  PublicBillingConfig,
  PublicPricingService,
  PublicSubscriptionPlan,
} from '../public-pricing.service';
import { appUrl } from '../../core/public-url';
import { dukarunWhatsAppUrl } from '../../core/public-contact';
import { DUKARUN_GUIDES_URL } from '../../core/public-learning';
import { PUBLIC_FAQS } from '../../core/public-faq';
import { AcquisitionService } from '../../core/acquisition.service';
import { WorkflowEvidenceComponent } from '../workflow-evidence.component';
import {
  DEMO_BASKET,
  DEMO_PRODUCTS,
  DEMO_SHOP,
  type DemoProduct,
} from '../../../../../../packages/marketing-demo';

interface CartLine {
  readonly product: DemoProduct;
  readonly qty: number;
}

interface Testimonial {
  readonly quote: string;
  readonly author: string;
  readonly title: string;
}

/**
 * Public landing page. Every claim here maps to a shipped v2 feature.
 * Product claims are grounded in shipped application workflows.
 * The till demo is fully client-side with fictional products and prices.
 */
@Component({
  selector: 'app-marketing-home',
  imports: [RouterLink, IconComponent, MarketingVideoComponent, WorkflowEvidenceComponent],
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
          Know what was sold, what should be in cash and M-Pesa, what customers owe and what stock
          remains, even when the internet drops.
        </p>
        <div class="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a [href]="acquisition.enquiryUrl()" class="btn btn-primary btn-lg min-h-11">
            Request a demo
            <app-icon name="heroArrowRight" size="md" />
          </a>
          <a href="#how-it-works" class="btn btn-outline btn-lg min-h-11">Try the counter</a>
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

    <!-- Problem recognition -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="questions-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">At closing time</span>
          <h2 id="questions-heading" class="mkt-h2 mt-2">
            Three questions your records should answer
          </h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            If these answers take hours, depend on memory or only appear after a stock count, the
            business is being run without a clear closing record.
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
      </div>
    </section>

    <!-- Daily cash-up entry point -->
    <section class="bg-neutral text-neutral-content" aria-labelledby="cash-up-heading">
      <div
        class="mkt-container grid items-center gap-7 py-12 sm:py-16 lg:grid-cols-[1fr_auto] lg:gap-12"
      >
        <div class="max-w-3xl">
          <span class="text-xs font-semibold uppercase tracking-[0.14em] text-primary"
            >Free closing tool · No account needed</span
          >
          <h2 id="cash-up-heading" class="mt-2 text-3xl font-bold tracking-tight">
            Count the drawer. Check M-Pesa. See the difference.
          </h2>
          <p class="mt-3 mb-0 max-w-2xl leading-relaxed text-neutral-content/70">
            Compare your sales record with the money received in about two minutes. Your figures are
            not saved.
          </p>
        </div>
        <a routerLink="/tools/daily-shop-cash-up" class="btn btn-primary min-h-12 px-6">
          Check today’s closing free
          <app-icon name="heroArrowRight" size="sm" />
        </a>
      </div>
    </section>

    @if (marketingVideoBaseUrl) {
      <!-- Product overview -->
      <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="overview-video-heading">
        <div class="mkt-container">
          <div class="text-center">
            <span class="mkt-eyebrow">See it in action</span>
            <h2 id="overview-video-heading" class="mkt-h2 mt-2">
              Turn daily work into reliable numbers
            </h2>
            <p class="mkt-lead mx-auto mt-3 max-w-xl">
              Sales, stock, staff, customer balances and controls stay on record across every
              location.
            </p>
          </div>
          <div class="mt-10">
            <app-marketing-video
              title="Dukarun product overview"
              duration="1:27"
              summary="Sales, stock, credit and accounting in one connected record."
              [src]="videoUrl('product-overview-full-wide.mp4')"
              [mobileSrc]="videoUrl('product-overview-full-square.mp4')"
              [poster]="videoUrl('product-overview-full-wide.png')"
              [mobilePoster]="videoUrl('product-overview-full-square.png')"
              [captions]="videoUrl('product-overview.en-KE.vtt')"
            />
          </div>
        </div>
      </section>
    }

    <!-- Interactive till demo -->
    <section
      id="how-it-works"
      class="scroll-mt-20 bg-base-100 py-14 sm:py-20"
      aria-labelledby="demo-heading"
    >
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">Live demo</span>
          <h2 id="demo-heading" class="mkt-h2 mt-2">Try the counter yourself</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            {{ demoShop.name }} is a fictional, established shop with one location and two counter
            staff. Try a sale of four bulbs and two sockets, then check the remaining stock.
          </p>
        </div>

        <div class="card mx-auto mt-10 max-w-4xl p-4 sm:p-6">
          <div class="flex flex-wrap items-center gap-2 pb-4">
            <span class="badge badge-primary font-semibold">{{ demoShop.name }}</span>
            <span class="text-sm text-base-content/70">Counter staff: {{ demoShop.cashier }}</span>
          </div>

          <div class="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
            <!-- Products -->
            <div class="grid grid-cols-2 content-start gap-2 lg:grid-cols-3">
              @for (product of products; track product.id) {
                <button
                  type="button"
                  (click)="addToCart(product)"
                  [disabled]="!demoReady() || !!paid() || qtyOf(product.id) >= stockOf(product.id)"
                  [attr.aria-label]="'Add ' + product.name + ' for KES ' + product.price"
                  [attr.aria-describedby]="'demo-stock-' + product.id"
                  class="relative flex min-h-11 flex-col items-start gap-1.5 rounded-field border border-base-300/60 bg-base-200/50 p-3 text-left transition-colors enabled:hover:border-primary/40 enabled:hover:bg-base-200 disabled:cursor-default"
                >
                  <span
                    class="flex h-8 w-8 items-center justify-center rounded-selector bg-primary/10 text-xs font-bold text-primary"
                  >
                    {{ product.initials }}
                  </span>
                  <span class="text-sm font-medium leading-tight">{{ product.name }}</span>
                  <span class="text-sm font-bold tabular-nums"
                    >{{ kes(product.price) }} / {{ product.unit }}</span
                  >
                  <span [id]="'demo-stock-' + product.id" class="text-xs text-base-content/70"
                    >{{ stockOf(product.id) }} in stock</span
                  >
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
                  <h3 class="mb-3 text-sm font-semibold">Counter sale</h3>
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
                        <li class="flex items-center justify-between gap-2 py-1.5 text-sm">
                          <span class="min-w-0">
                            {{ line.product.name }}
                            <span class="text-base-content/50">× {{ line.qty }}</span>
                          </span>
                          <div class="flex shrink-0 items-center gap-2">
                            <span class="font-semibold tabular-nums">
                              {{ (line.product.price * line.qty).toLocaleString('en-KE') }}
                            </span>
                            <button
                              type="button"
                              (click)="removeFromCart(line.product.id)"
                              [disabled]="!demoReady()"
                              [attr.aria-label]="'Remove one ' + line.product.name"
                              class="btn btn-ghost btn-square min-h-11 min-w-11"
                            >
                              −
                            </button>
                          </div>
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
                    [disabled]="!demoReady() || cart().size === 0"
                    class="btn btn-primary mt-3 w-full min-h-11"
                  >
                    Record sample M-Pesa sale
                  </button>
                  @if (cart().size > 0) {
                    <button
                      type="button"
                      (click)="clearCart()"
                      [disabled]="!demoReady()"
                      class="btn btn-ghost mt-1.5 min-h-11 w-full text-sm"
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
                      {{ demoShop.name }} · SAMPLE SALE
                    </p>
                    <p class="mb-0 mt-0.5 text-center text-xs opacity-60">
                      Counter staff: {{ demoShop.cashier }}
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
                      SAMPLE M-PESA SALE RECORDED
                    </p>
                    <p class="mb-0 mt-3 text-xs leading-relaxed" role="status">
                      Stock updated above. This sale stays in the demo.
                    </p>
                  </div>
                  <div class="receipt-edge shrink-0" aria-hidden="true"></div>
                  <div class="mt-3 flex flex-col gap-1.5">
                    <a
                      [href]="acquisition.enquiryUrl()"
                      class="btn btn-primary btn-sm w-full min-h-11"
                    >
                      Request a demo for my shop
                    </a>
                    <button
                      type="button"
                      (click)="resetDemo()"
                      class="btn btn-ghost min-h-11 w-full text-sm"
                    >
                      Reset sample sale
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
          <p class="mt-4 text-center text-sm text-base-content/70">
            @if (paid()) {
              Reset the sample to try a different basket.
            } @else {
              Tap a product to add one; use − to reduce a quantity.
            }
            Products, prices and records are illustrative. No payment is taken.
          </p>
        </div>
      </div>
    </section>

    <app-workflow-evidence />

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

    <!-- Customer voices -->
    <section class="bg-base-200/60 py-14 sm:py-20" aria-labelledby="voices-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">Word of mouth</span>
          <h2 id="voices-heading" class="mkt-h2 mt-2">From the shops that run on Dukarun</h2>
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

            @for (testimonial of testimonials; track testimonial.author; let last = $last) {
              <blockquote class="mb-0 text-sm leading-relaxed">
                "{{ testimonial.quote }}"
              </blockquote>
              <p class="mb-0 mt-2 text-xs uppercase tracking-wider opacity-60">
                {{ testimonial.author }} · {{ testimonial.title }}
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

    <!-- Choose a starting route -->
    <section
      class="border-y border-base-300/60 bg-base-200/60 py-14 sm:py-20"
      aria-labelledby="start-heading"
    >
      <div class="mkt-container">
        <div class="mx-auto max-w-2xl text-center">
          <span class="mkt-eyebrow">Ready to use it?</span>
          <h2 id="start-heading" class="mkt-h2 mt-2">Choose the right way to start</h2>
          <p class="mkt-lead mt-3">
            The subscription gives you ongoing access to Dukarun. Setup and staff training are
            separate services used only when your operation needs them.
          </p>
        </div>

        <div class="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-2">
          <article class="mkt-card flex flex-col p-6 sm:p-8">
            <span class="mkt-eyebrow">Simple operation</span>
            <h3 class="mt-2 text-2xl font-bold tracking-tight">Start it myself</h3>
            <p class="mt-3 text-base-content/70">
              Best for an owner-run shop or small team with one location and a straightforward sales
              process.
            </p>
            <ul class="mt-5 grid gap-3 text-sm text-base-content/75">
              <li class="flex items-start gap-2">
                <app-icon name="heroCheckCircle" size="md" class="mt-0.5 shrink-0 text-primary" />
                Start with five products or services
              </li>
              <li class="flex items-start gap-2">
                <app-icon name="heroCheckCircle" size="md" class="mt-0.5 shrink-0 text-primary" />
                Use a 30-minute orientation and simple guides
              </li>
              <li class="flex items-start gap-2">
                <app-icon name="heroCheckCircle" size="md" class="mt-0.5 shrink-0 text-primary" />
                Add more detail after the first sale
              </li>
            </ul>
            <a [href]="appUrl('/register')" class="btn btn-primary mt-7 min-h-12 self-start">
              Start my shop
              <app-icon name="heroArrowRight" size="sm" />
            </a>
          </article>

          <article class="mkt-card flex flex-col p-6 sm:p-8">
            <span class="mkt-eyebrow">More involved operation</span>
            <h3 class="mt-2 text-2xl font-bold tracking-tight">Get setup and staff training</h3>
            <p class="mt-3 text-base-content/70">
              Best when you have existing stock records, several employees, more than one location
              or a process that needs to be mapped first.
            </p>
            <ul class="mt-5 grid gap-3 text-sm text-base-content/75">
              <li class="flex items-start gap-2">
                <app-icon name="heroCheckCircle" size="md" class="mt-0.5 shrink-0 text-primary" />
                Business setup and data preparation
              </li>
              <li class="flex items-start gap-2">
                <app-icon name="heroCheckCircle" size="md" class="mt-0.5 shrink-0 text-primary" />
                Staff training around your normal work
              </li>
              <li class="flex items-start gap-2">
                <app-icon name="heroCheckCircle" size="md" class="mt-0.5 shrink-0 text-primary" />
                Quoted from your scope; typical engagements exceed KES 40,000
              </li>
            </ul>
            <a [href]="acquisition.enquiryUrl('setup')" class="btn whatsapp-action mt-7 self-start">
              <app-icon name="whatsapp" size="md" />
              Discuss my setup
            </a>
          </article>
        </div>

        <p class="mt-6 text-center text-sm text-base-content/65">
          Not sure which route fits?
          <a [href]="acquisition.enquiryUrl()" class="link whatsapp-link font-semibold"
            >Tell us how your business works</a
          >
          and we will recommend one.
        </p>
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
            Subscription pays for continued system access. Implementation pays for setup, data
            preparation and staff training only when your business needs them.
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
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h3 class="text-xl font-semibold">{{ plan.name }}</h3>
                  @if (isTestingAccessPlan(plan)) {
                    <span class="badge badge-primary">New-customer access</span>
                  }
                </div>
                <div class="mt-4 flex items-end gap-2">
                  <strong class="mkt-h2 tabular-nums">{{ kes(plan.price_monthly) }}</strong>
                  <span class="pb-1 text-sm text-base-content/60">/ month</span>
                </div>
                <p class="mt-2 mb-0 min-h-10 text-sm text-base-content/70">
                  @if (isTestingAccessPlan(plan)) {
                    {{ testingAccessMonths() }} months of access for
                    <span class="font-semibold text-primary">{{
                      kes(initialPurchasePrice())
                    }}</span>
                  } @else {
                    {{ kes(plan.price_yearly) }} per year
                    @if (yearlySaving(plan) > 0) {
                      <span class="font-semibold text-primary">
                        Save {{ kes(yearlySaving(plan)) }}
                      </span>
                    }
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

                <a [href]="appUrl('/register')" class="btn btn-primary mt-6 min-h-11 w-full">
                  @if (isTestingAccessPlan(plan)) {
                    Get {{ testingAccessMonths() }} months for {{ kes(initialPurchasePrice()) }}
                  } @else {
                    Register your business
                  }
                  <app-icon name="heroArrowRight" size="md" />
                </a>
              </article>
            }
          </div>
          <p class="mt-5 mb-0 text-center text-xs text-base-content/60">
            No card or special hardware required.
            @if (billingConfig(); as config) {
              Pay {{ kes(config.initialPurchasePrice) }} after approval for
              {{ config.testingAccessMonths }}
              {{ config.testingAccessMonths === 1 ? 'month' : 'months' }} of
              {{ config.newCustomerTierName }} access.
            }
            Trial access can be requested after approval when a shop needs evaluation time.
          </p>
        } @else {
          <div
            class="mx-auto mt-10 max-w-xl rounded-box border border-base-300 bg-base-100 p-6 text-center"
          >
            <h3 class="font-semibold">Pricing is temporarily unavailable</h3>
            <p class="mt-2 mb-0 text-sm text-base-content/70">
              Please
              <a
                [href]="pricingWhatsAppUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="link whatsapp-link"
                >ask us on WhatsApp</a
              >
              for the current price.
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
          <a [href]="guidesUrl" class="link link-primary font-medium">public guides</a>
          or
          <a
            [href]="whatsappUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="link whatsapp-link font-medium"
            >talk to us on WhatsApp</a
          >.
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
            [href]="appUrl('/register')"
            class="btn btn-lg min-h-11 border-white bg-white text-primary hover:bg-white/90"
          >
            Start my shop
            <app-icon name="heroArrowRight" size="md" />
          </a>
          <a [href]="acquisition.enquiryUrl('setup')" class="btn whatsapp-action">
            <app-icon name="whatsapp" size="md" />
            Ask about setup
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
  protected readonly acquisition = inject(AcquisitionService);
  protected readonly appUrl = appUrl;
  protected readonly guidesUrl = DUKARUN_GUIDES_URL;
  protected readonly whatsappUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I would like to know whether Dukarun is right for my business.'
  );
  protected readonly pricingWhatsAppUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I would like to ask about current Dukarun pricing.'
  );
  private readonly publicPricing = inject(PublicPricingService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly initialPlans = this.publicPricing.transferredPlans();
  private readonly initialConfig = this.publicPricing.transferredBillingConfig();

  protected readonly pricingPlans = signal<PublicSubscriptionPlan[]>(this.initialPlans ?? []);
  protected readonly billingConfig = signal<PublicBillingConfig | null>(this.initialConfig ?? null);
  protected readonly pricingLoading = signal(this.initialPlans === null);
  protected readonly marketingVideoBaseUrl = environment.marketingVideoBaseUrl.replace(/\/+$/, '');
  protected videoUrl(file: string): string {
    return `${this.marketingVideoBaseUrl}/${file}`;
  }

  async ngOnInit(): Promise<void> {
    const refresh = isPlatformBrowser(this.platformId) && this.initialPlans !== null;
    const [plans, config] = await Promise.allSettled([
      this.publicPricing.activePlans(refresh),
      this.publicPricing.billingConfig(refresh),
    ]);
    if (plans.status === 'fulfilled') this.pricingPlans.set(plans.value);
    if (config.status === 'fulfilled') this.billingConfig.set(config.value);
    this.pricingLoading.set(false);
  }

  protected readonly trustPoints = ['No hardware needed', 'Works offline', 'Cancel anytime'];

  protected readonly demoShop = DEMO_SHOP;
  protected readonly products = DEMO_PRODUCTS;
  protected readonly demoReady = signal(false);
  protected readonly stock = signal(new Map(this.products.map(p => [p.id, p.stock])));
  protected readonly cart = signal(new Map(DEMO_BASKET));
  protected readonly paid = signal<{ lines: CartLine[]; total: number } | null>(null);

  constructor() {
    afterNextRender(() => this.demoReady.set(true));
  }

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

  protected stockOf(id: string): number {
    return this.stock().get(id) ?? 0;
  }

  protected kes(amount: number): string {
    return `KES ${amount.toLocaleString('en-KE')}`;
  }

  protected yearlySaving(plan: PublicSubscriptionPlan): number {
    return Math.max(0, plan.price_monthly * 12 - plan.price_yearly);
  }

  protected isTestingAccessPlan(plan: PublicSubscriptionPlan): boolean {
    const config = this.billingConfig();
    return config?.newCustomerTierCode === plan.code;
  }

  protected initialPurchasePrice(): number {
    return this.billingConfig()?.initialPurchasePrice ?? 0;
  }

  protected testingAccessMonths(): number {
    return this.billingConfig()?.testingAccessMonths ?? 1;
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
    if (plan.whatsapp_per_period !== null)
      features.push(`${plan.whatsapp_per_period.toLocaleString('en-KE')} WhatsApp per month`);
    if (plan.fulfillment_available) features.push('Pickup & delivery');
    if (plan.storefront_available) features.push('Public storefront');
    if (plan.payment_reminders_available) features.push('Payment reminders');
    if (plan.staff_performance_enabled) features.push('Staff performance reports');
    if (plan.commissions_available) features.push('Sales commissions');
    if (plan.multiple_locations_enabled && plan.max_stock_locations === null)
      features.push('Multiple stock locations');
    return features;
  }

  protected addToCart(product: DemoProduct): void {
    if (!this.demoReady() || this.paid() || this.qtyOf(product.id) >= this.stockOf(product.id))
      return;
    const next = new Map(this.cart());
    next.set(product.id, (next.get(product.id) ?? 0) + 1);
    this.cart.set(next);
  }

  protected removeFromCart(id: string): void {
    const next = new Map(this.cart());
    const quantity = this.qtyOf(id) - 1;
    if (quantity > 0) next.set(id, quantity);
    else next.delete(id);
    this.cart.set(next);
  }

  protected clearCart(): void {
    this.cart.set(new Map());
  }

  protected charge(): void {
    if (!this.demoReady() || this.paid() || this.cart().size === 0) return;
    const lines = this.cartLines();
    this.stock.update(stock => {
      const next = new Map(stock);
      for (const line of lines)
        next.set(line.product.id, (stock.get(line.product.id) ?? 0) - line.qty);
      return next;
    });
    this.paid.set({ lines, total: this.cartTotal() });
    this.cart.set(new Map());
  }

  protected resetDemo(): void {
    this.paid.set(null);
    this.stock.set(new Map(this.products.map(p => [p.id, p.stock])));
    this.cart.set(new Map(DEMO_BASKET));
  }

  protected readonly closingQuestions = [
    {
      icon: 'heroChartBar',
      question: 'Do sales agree with cash and M-Pesa?',
      answer:
        'Compare what the shop recorded with the money actually received and see which payment channel needs review.',
    },
    {
      icon: 'heroUsers',
      question: 'Who still owes me, and how much?',
      answer:
        'Customer credit is tracked per person, with balances and payment history. No more flipping through the notebook under the counter.',
    },
    {
      icon: 'heroBanknotes',
      question: 'What did the business actually make?',
      answer:
        'Sales and expenses reach the same ledger, so you can review profit without rebuilding the month from notebooks.',
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

  protected readonly scenes = [
    {
      time: '07:30',
      icon: 'heroLockOpen',
      title: 'Open the shop',
      copy: 'Wanjiru starts a cashier session and confirms the opening float before serving the first customer.',
    },
    {
      time: '13:00',
      icon: 'heroShoppingCart',
      title: 'Serve the next customer',
      copy: 'An electrician collects bulbs and sockets. Record the correct items and payment method; if the connection drops, offline sales wait to sync.',
    },
    {
      time: '19:45',
      icon: 'heroLockClosed',
      title: 'Review the closing',
      copy: 'Count the drawer, compare the expected balance and review any difference. The owner can follow the session, stock and customer balances.',
    },
  ];

  protected readonly faqs = PUBLIC_FAQS;
}

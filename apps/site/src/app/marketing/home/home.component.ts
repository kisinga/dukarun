import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { BlogPostSummary, BlogService } from '../../blog/blog.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { MarketingVideoComponent } from '../marketing-video.component';
import {
  PublicBillingConfig,
  PublicPricingService,
  PublicSubscriptionPlan,
} from '../public-pricing.service';
import { appUrl } from '../../core/public-url';
import { dukarunWhatsAppUrl } from '../../core/public-contact';
import { DUKARUN_GUIDES_URL, dukarunGuideUrl } from '../../core/public-learning';

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

interface LearningStep {
  readonly title: string;
  readonly href: string;
}

/**
 * Public landing page. Every claim here maps to a shipped v2 feature.
 * Product claims are grounded in shipped application workflows.
 * The till demo is fully client-side with fictional products and prices.
 */
@Component({
  selector: 'app-marketing-home',
  imports: [RouterLink, DatePipe, IconComponent, MarketingVideoComponent],
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
          Record every sale, stock movement, credit balance and expense, even when the internet
          drops. Keep accurate books and make decisions from numbers you can trust.
        </p>
        <div class="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a [href]="appUrl('/register')" class="btn btn-primary btn-lg min-h-11">
            Get started
            <app-icon name="heroArrowRight" size="md" />
          </a>
          <a [href]="appUrl('/login')" class="btn btn-outline btn-lg min-h-11">Log in</a>
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
                    Record M-Pesa payment
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
                      M-PESA RECORDED · POSTED TO LEDGER
                    </p>
                    <div class="receipt-barcode mt-3 opacity-70" aria-hidden="true"></div>
                    <p class="mb-0 mt-1.5 text-center text-xs opacity-60">Asante · dukarun</p>
                  </div>
                  <div class="receipt-edge shrink-0" aria-hidden="true"></div>
                  <div class="mt-3 flex flex-col gap-1.5">
                    <a [href]="appUrl('/register')" class="btn btn-primary btn-sm w-full min-h-11">
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

    <!-- Public guides -->
    <section
      id="guides"
      class="scroll-mt-20 bg-base-200/60 py-14 sm:py-20"
      aria-labelledby="guides-heading"
    >
      <div class="mkt-container grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <div class="lg:sticky lg:top-24">
          <span class="mkt-eyebrow">Public guides</span>
          <h2 id="guides-heading" class="mkt-h2 mt-2">See how the work gets done</h2>
          <p class="mkt-lead mt-3 max-w-xl">
            Read Dukarun's complete help documentation before you sign up. Learn the workflow,
            understand the business terms, and see how each action reaches the books.
          </p>
          <ul class="mt-6 flex flex-col gap-3 text-sm text-base-content/75">
            <li class="flex items-start gap-2">
              <app-icon name="heroCheckCircle" size="md" class="mt-0.5 text-primary" />
              No account required to read or search
            </li>
            <li class="flex items-start gap-2">
              <app-icon name="heroCheckCircle" size="md" class="mt-0.5 text-primary" />
              Written around real shop workflows, not feature lists
            </li>
            <li class="flex items-start gap-2">
              <app-icon name="heroCheckCircle" size="md" class="mt-0.5 text-primary" />
              Interactive walkthroughs are available when you log in
            </li>
          </ul>
          <div class="mt-7 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <a [href]="guidesUrl" class="btn btn-primary min-h-11">
              Browse all guides
              <app-icon name="heroArrowRight" size="md" />
            </a>
            <a [href]="glossaryUrl" class="btn btn-outline min-h-11">Business glossary</a>
          </div>
        </div>

        <article class="mkt-card overflow-hidden">
          <div class="border-b border-base-300/70 bg-base-100 p-5 sm:p-6">
            <div class="flex items-start gap-3">
              <span
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-primary/10 text-primary"
              >
                <app-icon name="heroClipboardDocumentList" size="lg" />
              </span>
              <div class="min-w-0">
                <span class="mkt-eyebrow">Recommended starting point</span>
                <h3 class="mt-1 text-xl font-semibold">Your first business cycle</h3>
                <p class="mt-1 mb-0 text-sm text-base-content/70">
                  Follow one normal sequence from creating stock to understanding the financial
                  result.
                </p>
              </div>
            </div>
          </div>

          <ol class="divide-y divide-base-300/60 bg-base-100">
            @for (step of learningSteps; track step.href; let index = $index) {
              <li>
                <a
                  [href]="step.href"
                  class="group flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-base-200/60 sm:px-6"
                >
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary"
                  >
                    {{ index + 1 }}
                  </span>
                  <span class="min-w-0 flex-1 text-sm font-medium">{{ step.title }}</span>
                  <app-icon
                    name="heroArrowRight"
                    size="sm"
                    class="text-base-content/35 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </a>
              </li>
            }
          </ol>

          <div class="border-t border-base-300/70 bg-base-200/40 p-5 sm:px-6">
            <a
              [href]="firstBusinessCycleUrl"
              class="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
            >
              Read the complete learning journey
              <app-icon name="heroArrowRight" size="sm" />
            </a>
          </div>
        </article>
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

    <!-- Daily cash-up tool -->
    <section class="bg-neutral text-neutral-content" aria-labelledby="cash-up-heading">
      <div
        class="mkt-container grid items-center gap-7 py-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:gap-12"
      >
        <div class="max-w-3xl">
          <span class="text-xs font-semibold uppercase tracking-[0.14em] text-primary"
            >Free closing tool</span
          >
          <h2 id="cash-up-heading" class="mt-2 text-3xl font-bold tracking-tight">
            Count the drawer. Check M-Pesa. See the difference.
          </h2>
          <p class="mt-3 mb-0 max-w-2xl leading-relaxed text-neutral-content/70">
            Enter the shop record and the money received. The daily cash-up tool shows what should
            be there without saving your figures or asking you to create an account.
          </p>
        </div>
        <a routerLink="/tools/daily-shop-cash-up" class="btn btn-primary min-h-12 px-6">
          Check today’s closing
          <app-icon name="heroArrowRight" size="sm" />
        </a>
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
        <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (feature of features; track feature.title) {
            <a
              routerLink="/docs"
              [fragment]="feature.docId"
              class="mkt-card flex flex-col gap-3 p-5"
              [attr.aria-label]="'Read the documentation for ' + feature.title"
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

    @if (featuredPost(); as post) {
      <!-- Featured guide -->
      <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="journal-heading">
        <div class="mkt-container">
          <article
            class="grid overflow-hidden rounded-[1.25rem] border border-base-300/70 bg-base-200/45 shadow-sm lg:grid-cols-[0.9fr_1.1fr]"
          >
            <a
              [routerLink]="['/blog', post.slug]"
              class="relative block min-h-64 overflow-hidden bg-neutral sm:min-h-80"
              aria-label="Read {{ post.title }}"
            >
              @if (blogCover(post); as image) {
                <img
                  [src]="image"
                  [alt]="post.cover_image_alt || ''"
                  loading="lazy"
                  class="absolute inset-0 h-full w-full object-cover"
                />
              } @else {
                <div class="absolute inset-0 flex items-end bg-neutral p-8 text-neutral-content">
                  <span class="text-7xl font-bold tracking-[-0.07em] text-primary">D.</span>
                </div>
              }
            </a>
            <div class="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
              <span class="mkt-eyebrow">From the Dukarun guides</span>
              <h2 id="journal-heading" class="mt-3 text-3xl font-bold leading-tight tracking-tight">
                <a [routerLink]="['/blog', post.slug]" class="hover:text-primary">{{
                  post.title
                }}</a>
              </h2>
              <p class="mt-4 mb-0 text-base leading-relaxed text-base-content/65">
                {{ post.excerpt }}
              </p>
              <div class="mt-5 flex gap-4 text-sm text-base-content/50">
                <span>{{ post.published_at | date: 'd MMM y' }}</span>
                <span>{{ post.reading_minutes }} min read</span>
              </div>
              <a
                [routerLink]="['/blog', post.slug]"
                class="mt-7 inline-flex min-h-11 items-center gap-2 self-start font-semibold text-primary"
              >
                Read the guide
                <app-icon name="heroArrowRight" size="sm" />
              </a>
            </div>
          </article>
        </div>
      </section>
    }

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
            Get started
            <app-icon name="heroArrowRight" size="md" />
          </a>
          <a
            [href]="whatsappUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="btn whatsapp-action"
          >
            <app-icon name="whatsapp" size="md" />
            Chat on WhatsApp
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
  protected readonly appUrl = appUrl;
  protected readonly guidesUrl = DUKARUN_GUIDES_URL;
  protected readonly glossaryUrl = dukarunGuideUrl('glossary');
  protected readonly firstBusinessCycleUrl = dukarunGuideUrl('journeys/first-business-cycle');
  protected readonly whatsappUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I would like to know whether Dukarun is right for my business.'
  );
  protected readonly pricingWhatsAppUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I would like to ask about current Dukarun pricing.'
  );
  private readonly publicPricing = inject(PublicPricingService);
  private readonly blog = inject(BlogService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly initialPlans = this.publicPricing.transferredPlans();
  private readonly initialConfig = this.publicPricing.transferredBillingConfig();

  protected readonly pricingPlans = signal<PublicSubscriptionPlan[]>(this.initialPlans ?? []);
  protected readonly billingConfig = signal<PublicBillingConfig | null>(this.initialConfig ?? null);
  protected readonly pricingLoading = signal(this.initialPlans === null);
  protected readonly featuredPost = signal<BlogPostSummary | null>(null);
  protected readonly marketingVideoBaseUrl = environment.marketingVideoBaseUrl.replace(/\/+$/, '');
  protected videoUrl(file: string): string {
    return `${this.marketingVideoBaseUrl}/${file}`;
  }

  async ngOnInit(): Promise<void> {
    const refresh = isPlatformBrowser(this.platformId) && this.initialPlans !== null;
    const [plans, config, featured] = await Promise.allSettled([
      this.publicPricing.activePlans(refresh),
      this.publicPricing.billingConfig(refresh),
      this.blog.featuredPost(isPlatformBrowser(this.platformId)),
    ]);
    if (plans.status === 'fulfilled') this.pricingPlans.set(plans.value);
    if (config.status === 'fulfilled') this.billingConfig.set(config.value);
    if (featured.status === 'fulfilled') this.featuredPost.set(featured.value);
    this.pricingLoading.set(false);
  }

  protected blogCover(post: BlogPostSummary): string | null {
    return this.blog.coverUrl(post.cover_image_path);
  }

  protected readonly trustPoints = ['No hardware needed', 'Works offline', 'Cancel anytime'];

  protected readonly learningSteps: LearningStep[] = [
    {
      title: 'Create a product',
      href: dukarunGuideUrl('products/creating-a-product'),
    },
    {
      title: 'Create a supplier',
      href: dukarunGuideUrl('suppliers/creating-a-supplier'),
    },
    {
      title: 'Record a credit purchase',
      href: dukarunGuideUrl('purchases/recording-a-credit-purchase'),
    },
    {
      title: 'Complete a cash sale',
      href: dukarunGuideUrl('selling/making-a-cash-sale'),
    },
    {
      title: 'Create a customer and set credit',
      href: dukarunGuideUrl('customers-and-credit/creating-a-customer-with-credit'),
    },
    {
      title: 'Complete a credit sale',
      href: dukarunGuideUrl('selling/making-a-credit-sale'),
    },
  ];

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
      icon: 'heroCube',
      title: 'Inventory & batches',
      copy: 'Keep stock current with every sale and purchase, including costs, batches and expiry dates.',
      docId: 'inventory',
    },
    {
      icon: 'heroMapPin',
      title: 'Pickup & delivery',
      copy: 'Prepare orders, assign handoffs, collect COD and let customers follow progress from a private link.',
      docId: 'pickup-delivery',
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
      title: 'VAT calculations and double-entry books',
      copy: 'Turn on VAT accounting when your business needs it, then track VAT from inclusive sales and supplier invoices in balanced books.',
      docId: 'vat',
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
        'No. Dukarun runs on the Android phone you already have, and on any desktop browser for the back office. For paper receipts, use a Bluetooth or USB printer that is available through your device’s normal print service and supports 52 mm or 80 mm paper.',
    },
    {
      question: 'How do my customers pay?',
      answer:
        'Cash or M-Pesa, recorded at the till. You can also sell on credit to customers you trust, with balances and limits tracked per person.',
    },
    {
      question: 'Can I manage pickup and delivery orders?',
      answer:
        'Yes. Choose pickup or delivery at checkout, move the order through preparation and handoff, assign a delivery person, and share a private tracking link and PIN. Cash on delivery can be enabled per location.',
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
      question: 'Does Dukarun calculate VAT?',
      answer:
        'Yes. In a supported jurisdiction, a business can turn on VAT accounting when it needs it. Dukarun extracts VAT from VAT-inclusive sales and eligible supplier invoices, posts input and output VAT to the ledger, and provides VAT breakdowns and reports. The business remains responsible for registration, filing, and its tax obligations. eTIMS support is in development; Dukarun does not currently submit invoices.',
    },
    {
      question: 'How is the subscription billed?',
      answer:
        'Monthly or yearly, through M-Pesa. You get a prompt on your phone, approve it, and you are done.',
    },
  ];
}

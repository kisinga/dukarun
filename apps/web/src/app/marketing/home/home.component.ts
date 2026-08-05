import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';

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
          Sell by cash or M-Pesa, online or off. Every sale, stock change, and customer debt posts
          itself to a real double-entry ledger.
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
          <h2 id="demo-heading" class="mkt-h2 mt-2">Don't take our word for it. Make a sale.</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            This is the counter at Jiko Kiosk — a fictional shop with fictional prices. Tap
            products, charge, and watch the receipt.
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
                      <p class="mb-0 text-xs">Tap a product. That's the whole job.</p>
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
            You typed nothing. It's already in the books.
          </p>
        </div>
      </div>
    </section>

    <!-- Three questions -->
    <section class="bg-base-200/60 py-14 sm:py-20" aria-labelledby="questions-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">At closing time</span>
          <h2 id="questions-heading" class="mkt-h2 mt-2">
            Three questions your books should answer
          </h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            Every shopkeeper asks the same three when the doors close. Most notebooks can't answer
            them.
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
          Answered by your ledger. Not your memory.
        </p>
      </div>
    </section>

    <!-- Features -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="features-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">What's inside</span>
          <h2 id="features-heading" class="mkt-h2 mt-2">One app for the whole shop</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            Everything listed here ships today. No teaser tiers, no "coming soon" dressed up as
            features.
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
      </div>
    </section>

    <!-- A day at the duka -->
    <section class="bg-base-200/60 py-14 sm:py-20" aria-labelledby="day-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">A day at the duka</span>
          <h2 id="day-heading" class="mkt-h2 mt-2">The day counts itself</h2>
        </div>
        <ol class="mt-12 grid gap-8 md:grid-cols-3">
          @for (scene of scenes; track scene.time) {
            <li class="border-t-2 border-primary/50 pt-5">
              <div class="flex items-baseline justify-between gap-3">
                <span class="text-2xl font-bold tabular-nums tracking-tight text-base-content/80">
                  {{ scene.time }}
                </span>
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-primary/10 text-primary"
                >
                  <app-icon [name]="scene.icon" size="lg" />
                </span>
              </div>
              <h3 class="mt-2 text-lg font-semibold">{{ scene.title }}</h3>
              <p class="mt-1 mb-0 text-sm text-base-content/70">{{ scene.copy }}</p>
            </li>
          }
        </ol>
      </div>
    </section>

    <!-- The honest deal -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="deal-heading">
      <div class="mkt-container">
        <div class="card p-6 sm:p-10">
          <div class="text-center">
            <span class="mkt-eyebrow">The honest deal</span>
            <h2 id="deal-heading" class="mkt-h2 mt-2">
              What you pay. What you get. No fine print.
            </h2>
          </div>
          <div class="mx-auto mt-8 grid max-w-4xl gap-8 md:grid-cols-2">
            <div>
              <h3 class="text-sm font-bold uppercase tracking-widest text-primary">The deal</h3>
              <ul class="mt-4 flex flex-col gap-3 text-sm text-base-content/80">
                @for (item of deal; track item) {
                  <li class="flex items-start gap-2.5">
                    <app-icon name="heroCheck" size="md" class="mt-0.5 shrink-0 text-primary" />
                    {{ item }}
                  </li>
                }
              </ul>
            </div>
            <div>
              <h3 class="text-sm font-bold uppercase tracking-widest text-base-content/50">
                Full disclosure
              </h3>
              <ul class="mt-4 flex flex-col gap-3 text-sm text-base-content/70">
                @for (item of disclosure; track item) {
                  <li class="flex items-start gap-2.5">
                    <app-icon name="heroMinus" size="md" class="mt-0.5 shrink-0 text-primary" />
                    {{ item }}
                  </li>
                }
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="bg-base-200/60 py-14 sm:py-20" aria-labelledby="faq-heading">
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
          Set up this morning. Sell by lunch. Close the day with nothing left to count.
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
export class HomeComponent {
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
      question: 'Did I actually make money today?',
      answer:
        'Every sale and expense posts to a double-entry ledger. Profit is a number you read, not a feeling you guess.',
    },
    {
      icon: 'heroUsers',
      question: 'Who still owes me — and how much?',
      answer:
        'Customer credit is tracked per person with balances and payment history, so the notebook under the counter can retire.',
    },
    {
      icon: 'heroCube',
      question: 'What should I restock tomorrow?',
      answer:
        'Stock adjusts itself with every sale. Batches and expiry dates tell you what to move first and what to reorder.',
    },
  ];

  protected readonly features: Feature[] = [
    {
      icon: 'heroShoppingCart',
      title: 'Point of sale',
      copy: 'A fast counter screen built for phones: tap products, take cash or M-Pesa, print or send the receipt.',
      docId: 'pos',
    },
    {
      icon: 'heroSignalSlash',
      title: 'Offline selling',
      copy: 'No internet, no problem. Sales queue on the device and sync themselves when the network comes back.',
      docId: 'offline',
    },
    {
      icon: 'heroCube',
      title: 'Inventory & batches',
      copy: 'Stock levels, batch tracking, and expiry dates — so the oldest stock sells first and nothing quietly expires.',
      docId: 'inventory',
    },
    {
      icon: 'heroUsers',
      title: 'Customer credit',
      copy: 'Sell on credit without losing track: per-customer balances, limits, and a clear record of every payment.',
      docId: 'credit',
    },
    {
      icon: 'heroBanknotes',
      title: 'Cashier sessions',
      copy: 'Each cashier opens and closes a session. Expected vs counted cash is reconciled at every handover.',
      docId: 'cashier-sessions',
    },
    {
      icon: 'heroClipboardDocumentList',
      title: 'Double-entry ledger',
      copy: 'Real books under the hood: every transaction posts debit and credit, so reports always balance.',
      docId: 'ledger',
    },
    {
      icon: 'heroCheckBadge',
      title: 'Approvals & roles',
      copy: 'Sensitive actions need a second pair of eyes. Owners, managers, and cashiers each see what they should.',
      docId: 'approvals',
    },
    {
      icon: 'heroChatBubbleLeftRight',
      title: 'SMS & WhatsApp receipts',
      copy: 'Send customers their receipt or balance reminder by SMS or WhatsApp — straight from the sale.',
      docId: 'receipts',
    },
    {
      icon: 'heroCreditCard',
      title: 'M-Pesa billing',
      copy: 'Your subscription is billed through M-Pesa. No card, no paperwork — pay the way you already do.',
      docId: 'billing',
    },
    {
      icon: 'heroUserGroup',
      title: 'Team management',
      copy: 'Add staff, assign roles, and see who sold what. Accountability without hovering over the counter.',
      docId: 'team',
    },
    {
      icon: 'heroTruck',
      title: 'Suppliers & purchases',
      copy: 'Track what you owe suppliers alongside what customers owe you — one honest view of your position.',
      docId: 'suppliers',
    },
    {
      icon: 'heroDevicePhoneMobile',
      title: 'Phone-first',
      copy: 'Designed for a cheap Android in bright sunlight, one-handed, on spotty data. Desktop is the back office.',
      docId: 'phone-first',
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
      copy: 'The internet drops. Nobody notices. Sales keep ringing and queue quietly on the phone until signal returns.',
    },
    {
      time: '19:45',
      icon: 'heroLockClosed',
      title: 'Close in minutes',
      copy: 'Count the drawer, match it against the session, post the day. The ledger already knows the answer.',
    },
  ];

  protected readonly deal = [
    'One flat monthly subscription, billed through M-Pesa.',
    'The whole product, not a teaser tier — every feature above is included.',
    'Pause anytime. Your data stays yours; export it whenever.',
    'Cancel anytime. No exit fees, no phone calls, no guilt trip.',
  ];

  protected readonly disclosure = [
    'Customer-initiated M-Pesa (STK push from the buyer) is still in the works. Today you record M-Pesa payments from your existing till.',
    'Receipts go out by SMS or WhatsApp from your account; carrier charges may apply on your side.',
    'Hands-on setup and staff training are optional extras, quoted for your location and team size.',
  ];

  protected readonly faqs: Faq[] = [
    {
      question: 'What happens when my internet drops?',
      answer:
        'Nothing stops. The POS keeps selling offline and queues every sale on the device. When the network returns, queued sales sync to your books automatically — with safeguards so a sale is never posted twice.',
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
      question: 'Can my staff use it without seeing everything?',
      answer:
        'Yes. Cashiers sell; managers approve; owners see the books. Roles decide what each person can do, and sensitive actions like price overrides or stock adjustments can require approval.',
    },
    {
      question: 'How is the subscription billed?',
      answer:
        'Monthly, through M-Pesa. You get a prompt, approve it, done — the same way you already pay for everything else.',
    },
  ];
}

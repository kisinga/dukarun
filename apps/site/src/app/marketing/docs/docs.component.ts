import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';
import { appUrl } from '../../core/public-url';

interface Step {
  readonly title: string;
  readonly copy: string;
}

interface DocSection {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly summary: string;
  readonly details: string[];
}

/**
 * Public getting-started guide and feature documentation. Sections are
 * collapsed accordions with stable anchor ids. Homepage feature cards
 * deep-link into them (/docs#offline, /docs#credit, …).
 * Everything documented here is a shipped v2 feature.
 */
@Component({
  selector: 'app-marketing-docs',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Hero -->
    <section class="bg-base-200/60 py-16 sm:py-24">
      <div class="mkt-container flex flex-col items-center text-center">
        <span class="mkt-eyebrow">Getting started</span>
        <h1 class="mkt-h1 mt-3">From zero to first sale in one morning</h1>
        <p class="mkt-lead mx-auto mt-4 max-w-2xl">
          Five steps to a working shop, then documentation for every feature. Expand the ones you
          care about; everything here is live today.
        </p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <a [href]="appUrl('/register')" class="btn btn-primary min-h-11">
            Create your account
            <app-icon name="heroArrowRight" size="md" />
          </a>
          <a href="#features" class="btn btn-outline min-h-11">Skip to the features</a>
        </div>
      </div>
    </section>

    <!-- Quick start -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="quickstart-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">The first morning</span>
          <h2 id="quickstart-heading" class="mkt-h2 mt-2">Five steps, one counter</h2>
        </div>
        <ol class="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          @for (step of steps; track step.title) {
            <li class="mkt-card flex flex-col gap-2 p-6">
              <span class="text-2xl font-bold tabular-nums tracking-tight text-primary">
                0{{ $index + 1 }}
              </span>
              <h3 class="font-semibold">{{ step.title }}</h3>
              <p class="mb-0 text-sm text-base-content/70">{{ step.copy }}</p>
            </li>
          }
          <li
            class="flex flex-col justify-center gap-2 rounded-box border border-dashed border-primary/40 bg-primary/5 p-6"
          >
            <h3 class="font-semibold text-primary">That's all it takes.</h3>
            <p class="mb-0 text-sm text-base-content/70">
              From here, stock moves with every sale and the day closes balanced.
            </p>
          </li>
        </ol>
      </div>
    </section>

    <!-- Feature documentation (collapsed) -->
    <section
      id="features"
      class="scroll-mt-20 bg-base-200/60 py-14 sm:py-20"
      aria-labelledby="features-heading"
    >
      <div class="mkt-container max-w-3xl">
        <div class="text-center">
          <span class="mkt-eyebrow">Documentation</span>
          <h2 id="features-heading" class="mkt-h2 mt-2">Every feature, expanded on demand</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            Scan the list, then open the ones you care about for the full story.
          </p>
        </div>
        <div class="mt-10 flex flex-col gap-3">
          @for (section of sections; track section.id) {
            <div
              [id]="section.id"
              class="collapse collapse-arrow scroll-mt-24 rounded-box border border-base-300/60 bg-base-100"
            >
              <input type="checkbox" [id]="'doc-' + section.id" />
              <div class="collapse-title flex items-center gap-3 font-semibold">
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-primary/10 text-primary"
                >
                  <app-icon [name]="section.icon" size="md" />
                </span>
                <span class="flex flex-col">
                  {{ section.title }}
                  <span class="text-xs font-normal text-base-content/60">
                    {{ section.summary }}
                  </span>
                </span>
              </div>
              <div class="collapse-content">
                <div
                  class="flex flex-col gap-3 border-t border-base-300/60 pt-3 text-sm text-base-content/75"
                >
                  @for (paragraph of section.details; track paragraph) {
                    <p class="mb-0">{{ paragraph }}</p>
                  }
                </div>
              </div>
            </div>
          }
        </div>
        <p class="mt-8 text-center text-sm text-base-content/70">
          Something unclear?
          <a routerLink="/contact" class="link link-primary font-medium">Ask us directly</a> and
          we'll answer.
        </p>
        <aside
          class="mt-10 flex flex-col gap-4 rounded-box border border-primary/20 bg-primary/5 p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p class="font-semibold">Setting up scanners or printers?</p>
            <p class="mb-0 mt-1 text-sm text-base-content/70">
              Check compatible hardware, paper sizes, test printing, and troubleshooting.
            </p>
          </div>
          <a routerLink="/docs/hardware" class="btn btn-outline min-h-11 shrink-0">
            Hardware setup
            <app-icon name="heroArrowRight" size="sm" />
          </a>
        </aside>
      </div>
    </section>

    <!-- Closer -->
    <section class="bg-primary text-primary-content">
      <div class="mkt-container py-16 text-center sm:py-20">
        <h2 class="mkt-h1">Ready when you are.</h2>
        <p class="mx-auto mt-4 max-w-xl text-primary-content/85">
          Create the account now, add your first products over chai, sell by lunch.
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
            routerLink="/"
            class="btn btn-lg btn-outline min-h-11 border-white/70 text-white hover:bg-white/10"
          >
            Back to the demo
          </a>
        </div>
      </div>
    </section>
  `,
})
export class DocsComponent {
  protected readonly appUrl = appUrl;
  protected readonly steps: Step[] = [
    {
      title: 'Create your account',
      copy: 'Register with your phone number and shop name. The subscription bills through M-Pesa when the time comes, so no card or paperwork.',
    },
    {
      title: 'Add your products',
      copy: 'Names, prices, and opening stock. Bring batches and expiry dates in from day one so the oldest stock always sells first.',
    },
    {
      title: 'Invite your team',
      copy: 'Add cashiers and managers with roles. Each person gets their own login, and sensitive actions can require approval.',
    },
    {
      title: 'Open a cashier session',
      copy: 'Count the float, open the session. From this moment every sale is tied to a person and a drawer.',
    },
    {
      title: 'Make your first sale',
      copy: 'Tap products, take cash or M-Pesa, and print the completed receipt. Sales remain available when the connection drops.',
    },
  ];

  protected readonly sections: DocSection[] = [
    {
      id: 'pos',
      icon: 'heroShoppingCart',
      title: 'Point of sale',
      summary: 'The counter screen your cashiers live in.',
      details: [
        'The sell screen is a grid of your products: tap to add, tap to adjust, charge. It is built for a phone held in one hand, with large targets, the total always visible, and no typing for a normal sale.',
        'Payments are cash, M-Pesa, or a split of both. Change is calculated for you, and every payment method lands in the right place in the books.',
        'Receipts can be printed at the counter before the customer leaves, then reprinted later from the completed sale when needed.',
      ],
    },
    {
      id: 'offline',
      icon: 'heroSignalSlash',
      title: 'Offline selling',
      summary: 'The shop never stops because the network did.',
      details: [
        'When the internet drops, the POS keeps working. Sales are queued safely on the device with a unique reference, so a retry can never post the same sale twice.',
        'Queued sales sync automatically when connectivity returns, and you can watch the pending count and sync status from the app.',
        "Signing out with unsynced sales on the device triggers a warning, so a day's takings are never stranded on a phone.",
      ],
    },
    {
      id: 'inventory',
      icon: 'heroCube',
      title: 'Inventory & batches',
      summary: 'Stock that stays up to date, batches and expiry included.',
      details: [
        'Every sale deducts stock; every purchase adds it. Stock adjustments (damage, theft, corrections) are recorded with reasons and can require approval.',
        'Batches track purchase date, cost, and expiry. The app shows you what is expiring soon so you sell it first instead of writing it off.',
        'Need stock in another shop or store? Stock transfers move quantities between locations with a full paper trail.',
      ],
    },
    {
      id: 'credit',
      icon: 'heroUsers',
      title: 'Customer credit',
      summary: 'Sell on credit without the notebook.',
      details: [
        'Trusted customers can take goods now and pay later. Each customer has a running balance, an optional credit limit, and a full payment history.',
        'The credit view shows everyone who owes you, how much, and for how long, with aging so old debts stand out before they become losses.',
        'Balance reminders go out by SMS or WhatsApp, which is usually all the chasing a debt needs.',
      ],
    },
    {
      id: 'cashier-sessions',
      icon: 'heroBanknotes',
      title: 'Cashier sessions',
      summary: 'Every shilling tied to a person and a drawer.',
      details: [
        'A cashier opens a session with a counted float, sells, and closes with a count. The app compares expected cash against counted cash and shows the variance immediately.',
        'Handovers stop being arguments: the session record says exactly what should be in the drawer and who was holding it.',
      ],
    },
    {
      id: 'ledger',
      icon: 'heroClipboardDocumentList',
      title: 'Double-entry ledger',
      summary: 'Real books under every sale.',
      details: [
        'Every transaction posts both a debit and a credit: sales, expenses, supplier payments, customer credit, everything. That is why the reports always balance.',
        'You do not need to understand accounting to benefit: the ledger keeps the books balanced, so the numbers you see at closing time are right.',
        'Periods can be closed formally, locking the books for that day or month so history cannot be quietly rewritten.',
      ],
    },
    {
      id: 'approvals',
      icon: 'heroCheckBadge',
      title: 'Approvals & team roles',
      summary: 'Trust your team, verify the sensitive stuff.',
      details: [
        'Roles decide what each person can do: cashiers sell, managers approve, owners see everything. Permissions are enforced by the app itself.',
        'Sensitive actions, including large discounts, stock adjustments, or refunds, can be held for approval. The request reaches a manager, who approves or rejects with one tap.',
        'An audit trail records who did what and when, so "I don\'t know what happened" stops being an answer.',
      ],
    },
    {
      id: 'receipts',
      icon: 'heroPrinter',
      title: 'Receipts & payment reminders',
      summary: 'Print receipts and send fact-based payment reminders.',
      details: [
        'Print a completed-sale receipt from the counter or order history whenever the customer needs another copy.',
        'Dukarun can send fixed due-date and overdue-balance reminders by SMS or WhatsApp when the customer has consented.',
        'Shops cannot compose general broadcasts or change the approved reminder wording.',
      ],
    },
    {
      id: 'billing',
      icon: 'heroCreditCard',
      title: 'Subscription billing via M-Pesa',
      summary: 'Flexible plans, paid the way you already pay.',
      details: [
        'Choose the subscription plan whose features and usage limits fit your shop, with monthly or discounted yearly billing.',
        'Billing runs through M-Pesa: you get a prompt on your phone, approve it, and you are done. No card required, no dollar invoices.',
        'Pause or cancel anytime from the app. Your data stays yours and can be exported whenever you like.',
      ],
    },
    {
      id: 'team',
      icon: 'heroUserGroup',
      title: 'Team management',
      summary: 'Who works here, and who did what.',
      details: [
        'Invite staff by phone, assign roles, and deactivate access when someone leaves. Their sales history stays intact.',
        'Staff performance views show sales per person, so pay and performance conversations both have numbers behind them.',
        'Optional commissions can be configured per team member where that fits how you pay.',
      ],
    },
    {
      id: 'suppliers',
      icon: 'heroTruck',
      title: 'Suppliers & purchases',
      summary: 'What you owe, next to what you are owed.',
      details: [
        'Record purchases from suppliers as they happen. They add stock and create payables in one step.',
        'The money view puts supplier payables next to customer receivables, so you see your true position in one place.',
      ],
    },
    {
      id: 'phone-first',
      icon: 'heroDevicePhoneMobile',
      title: 'Phone-first design',
      summary: 'Built for a cheap Android in bright sunlight.',
      details: [
        'The counter is designed for phones first: one-handed use, high-contrast surfaces, large touch targets, and fast screens on spotty data.',
        'On desktop, the ledger, reports, credit, and settings get wider, denser views of the same data.',
        'Install it to your home screen and it behaves like a native app, offline support included.',
      ],
    },
  ];
}

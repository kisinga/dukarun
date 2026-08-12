import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';
import { appUrl } from '../../core/public-url';
import { dukarunWhatsAppUrl } from '../../core/public-contact';

/**
 * Public about page. Why Dukarun exists and what it believes.
 */
@Component({
  selector: 'app-marketing-about',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Hero -->
    <section class="bg-base-200/60 py-16 sm:py-24">
      <div class="mkt-container flex flex-col items-center text-center">
        <span class="mkt-eyebrow">About dukarun</span>
        <h1 class="mkt-h1 mt-3">Built for the duka down your street</h1>
        <p class="mkt-lead mx-auto mt-4 max-w-2xl">
          Running a shop means long hours and thin margins, and too often a notebook that never
          quite balances. We build dukarun so the paperwork isn't the hardest part of your day.
        </p>
      </div>
    </section>

    <!-- Beliefs -->
    <section class="bg-base-100 py-14 sm:py-20" aria-labelledby="beliefs-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">What we believe</span>
          <h2 id="beliefs-heading" class="mkt-h2 mt-2">Software should earn its keep</h2>
          <p class="mkt-lead mx-auto mt-3 max-w-xl">
            Three convictions shape everything we ship. We hold ourselves to them on every release.
          </p>
        </div>
        <div class="mt-10 grid gap-4 md:grid-cols-3">
          @for (belief of beliefs; track belief.title) {
            <article class="mkt-card flex flex-col gap-3 p-6">
              <span
                class="flex h-11 w-11 items-center justify-center rounded-field bg-primary/10 text-primary"
              >
                <app-icon [name]="belief.icon" size="lg" />
              </span>
              <h3 class="text-lg font-semibold">{{ belief.title }}</h3>
              <p class="mb-0 text-sm text-base-content/70">{{ belief.copy }}</p>
            </article>
          }
        </div>
      </div>
    </section>

    <!-- Difference -->
    <section class="bg-base-200/60 py-14 sm:py-20" aria-labelledby="difference-heading">
      <div class="mkt-container">
        <div class="text-center">
          <span class="mkt-eyebrow">The difference</span>
          <h2 id="difference-heading" class="mkt-h2 mt-2">What makes dukarun different</h2>
        </div>
        <div class="mt-10 grid gap-4 md:grid-cols-2">
          @for (item of differences; track item.title) {
            <div
              class="flex items-start gap-4 rounded-box border border-base-300/60 bg-base-100 p-6"
            >
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-primary/10 text-primary"
              >
                <app-icon [name]="item.icon" size="lg" />
              </span>
              <div>
                <h3 class="font-semibold">{{ item.title }}</h3>
                <p class="mb-0 mt-1 text-sm text-base-content/70">{{ item.copy }}</p>
              </div>
            </div>
          }
        </div>
        <p class="mt-8 text-center text-sm text-base-content/70">
          We'd rather promise less and deliver more. Everything on the
          <a routerLink="/" class="link link-primary font-medium">homepage</a> works today.
        </p>
      </div>
    </section>

    <!-- Closer -->
    <section class="bg-primary text-primary-content">
      <div class="mkt-container py-16 text-center sm:py-20">
        <h2 class="mkt-h1">See it on your own counter.</h2>
        <p class="mx-auto mt-4 max-w-xl text-primary-content/85">
          The demo on the homepage takes two minutes. Setting up your shop takes one morning.
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
            class="btn whatsapp-button btn-lg min-h-11 gap-2"
          >
            <app-icon name="whatsapp" size="md" />
            Talk to us on WhatsApp
          </a>
        </div>
      </div>
    </section>
  `,
})
export class AboutComponent {
  protected readonly appUrl = appUrl;
  protected readonly whatsappUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I would like to learn more about how Dukarun could work for my business.'
  );
  protected readonly beliefs = [
    {
      icon: 'heroBanknotes',
      title: 'Money is the product',
      copy: 'A POS that loses track of money is worse than a notebook. Sales, credit, expenses, and cash in the drawer all answer to the ledger.',
    },
    {
      icon: 'heroSignalSlash',
      title: 'Offline is normal',
      copy: 'Kenyan internet goes down, and the shop must never stop because of it. We build for the network you actually have, not the one on the brochure.',
    },
    {
      icon: 'heroDevicePhoneMobile',
      title: 'The counter comes first',
      copy: 'Cashiers use it standing up, one-handed, on a cheap phone in sunlight. If it is not fast there, we do not ship it.',
    },
  ];

  protected readonly differences = [
    {
      icon: 'heroClipboardDocumentList',
      title: 'Real accounting underneath',
      copy: 'Double-entry books, approvals, and audit trails. The discipline of a finance department, sized for one shop.',
    },
    {
      icon: 'heroUsers',
      title: 'Credit that stays organised',
      copy: 'Selling on credit is how dukas work. Balances, limits, and payment history are tracked per customer, not in a notebook.',
    },
    {
      icon: 'heroPrinter',
      title: 'Receipts and responsible reminders',
      copy: 'Print receipts and send approved balance reminders by SMS or WhatsApp, with consent and delivery controls built in.',
    },
    {
      icon: 'heroCreditCard',
      title: 'Billing that fits your life',
      copy: 'Choose a subscription plan and pay monthly or yearly through M-Pesa. No card required, no dollar invoices, no surprises.',
    },
  ];
}

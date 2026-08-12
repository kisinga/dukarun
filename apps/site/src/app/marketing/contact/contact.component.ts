import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';
import { DUKARUN_WHATSAPP_DISPLAY, dukarunWhatsAppUrl } from '../../core/public-contact';

interface Channel {
  readonly icon: string;
  readonly title: string;
  readonly copy: string;
  readonly linkText: string;
  readonly linkHref: string;
  readonly external: boolean;
  readonly newTab?: boolean;
  readonly whatsapp?: boolean;
}

/**
 * Public contact page. All details are the product's own address only.
 * no real phone numbers or personal contacts.
 */
@Component({
  selector: 'app-marketing-contact',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Hero -->
    <section class="bg-base-200/60 py-16 sm:py-24">
      <div class="mkt-container flex flex-col items-center text-center">
        <span class="mkt-eyebrow">Contact</span>
        <h1 class="mkt-h1 mt-3">Talk to us</h1>
        <p class="mkt-lead mx-auto mt-4 max-w-2xl">
          Ask about the product, pricing, setup, or your account. Start a WhatsApp conversation for
          the quickest path to the Dukarun team.
        </p>
      </div>
    </section>

    <!-- Channels -->
    <section class="bg-base-100 pb-14 sm:pb-20" aria-label="Contact channels">
      <div class="mkt-container grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        @for (channel of channels; track channel.title) {
          <article
            class="mkt-card flex flex-col gap-3 p-6"
            [class.whatsapp-channel]="channel.whatsapp"
          >
            <span
              class="flex h-11 w-11 items-center justify-center rounded-field"
              [class.bg-primary/10]="!channel.whatsapp"
              [class.text-primary]="!channel.whatsapp"
              [class.whatsapp-channel-icon]="channel.whatsapp"
            >
              <app-icon [name]="channel.icon" size="lg" />
            </span>
            <h2 class="text-lg font-semibold">{{ channel.title }}</h2>
            <p class="mb-0 flex-1 text-sm text-base-content/70">{{ channel.copy }}</p>
            @if (channel.external) {
              <a
                [href]="channel.linkHref"
                [target]="channel.newTab ? '_blank' : null"
                [rel]="channel.newTab ? 'noopener noreferrer' : null"
                class="link mt-1 font-medium"
                [class.link-primary]="!channel.whatsapp"
                [class.whatsapp-link]="channel.whatsapp"
              >
                {{ channel.linkText }}
              </a>
            } @else {
              <a [routerLink]="channel.linkHref" class="link link-primary mt-1 font-medium">
                {{ channel.linkText }}
              </a>
            }
          </article>
        }
      </div>
    </section>

    <!-- Setup and training -->
    <section class="bg-base-100 pb-14 sm:pb-20" aria-labelledby="setup-heading">
      <div class="mkt-container">
        <div class="card p-6 sm:p-10">
          <div class="mx-auto w-full max-w-2xl text-center">
            <span class="mkt-eyebrow">Optional extra</span>
            <h2 id="setup-heading" class="mkt-h2 mt-2">Installation and training</h2>
            <p class="mkt-lead mx-auto mt-3">
              Want hands-on help? We can come set up your shop and train your staff. Pricing depends
              on your location, number of shops, and team size, and we always quote before any work
              begins.
            </p>
            <div class="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                [href]="setupWhatsAppUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn whatsapp-action"
              >
                <app-icon name="whatsapp" size="md" />
                Ask about setup on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Expectation -->
    <section class="bg-base-200/60 py-14 sm:py-20" aria-labelledby="expectation-heading">
      <div class="mkt-container text-center">
        <h2 id="expectation-heading" class="mkt-h2">You'll hear back from us</h2>
        <p class="mkt-lead mx-auto mt-3 max-w-xl">
          Every message is read by the team that builds Dukarun. We respond on WhatsApp during
          Kenyan business hours, and email within one working day.
        </p>
        <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            [href]="whatsappUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="btn whatsapp-action"
          >
            <app-icon name="whatsapp" size="md" />
            Chat on WhatsApp
          </a>
          <a href="mailto:hello@dukarun.com" class="btn btn-outline btn-lg min-h-11">
            <app-icon name="heroEnvelope" size="md" />
            hello&#64;dukarun.com
          </a>
          <a routerLink="/" class="btn btn-outline btn-lg min-h-11">Back to the homepage</a>
        </div>
      </div>
    </section>
  `,
})
export class ContactComponent {
  protected readonly whatsappUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I would like to learn more about the product.'
  );
  protected readonly setupWhatsAppUrl = dukarunWhatsAppUrl(
    'Hello Dukarun, I would like a quote for installation and staff training.'
  );
  protected readonly channels: Channel[] = [
    {
      icon: 'whatsapp',
      title: 'WhatsApp',
      copy: 'The quickest way to ask about Dukarun, pricing, setup, or an existing account.',
      linkText: DUKARUN_WHATSAPP_DISPLAY,
      linkHref: dukarunWhatsAppUrl(
        'Hello Dukarun, I have a question about Dukarun. Can you help me?'
      ),
      external: true,
      newTab: true,
      whatsapp: true,
    },
    {
      icon: 'heroEnvelope',
      title: 'Email',
      copy: 'Questions about the product, pricing, or your account. We reply within one working day.',
      linkText: 'hello@dukarun.com',
      linkHref: 'mailto:hello@dukarun.com',
      external: true,
    },
    {
      icon: 'heroSparkles',
      title: 'Try it first',
      copy: 'Many questions answer themselves in the demo till on the homepage. Give it a try before you write.',
      linkText: 'Open the demo',
      linkHref: '/',
      external: false,
    },
    {
      icon: 'heroUsers',
      title: 'Setup & training',
      copy: 'Hands-on installation and staff training, quoted for your location and team size.',
      linkText: 'Ask for a quote',
      linkHref: 'mailto:hello@dukarun.com',
      external: true,
    },
  ];
}

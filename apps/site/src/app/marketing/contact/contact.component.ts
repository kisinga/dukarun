import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';
import { DUKARUN_WHATSAPP_DISPLAY, dukarunWhatsAppUrl } from '../../core/public-contact';
import { QualifiedEnquiryComponent } from './qualified-enquiry.component';

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
  imports: [RouterLink, IconComponent, QualifiedEnquiryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-qualified-enquiry />
    <!-- Support and general enquiries -->
    <section id="support" class="bg-base-100 py-12 sm:py-16">
      <div class="mkt-container flex flex-col items-center text-center">
        <span class="mkt-eyebrow">Contact</span>
        <h2 class="mkt-h2 mt-3">Support and other questions</h2>
        <p class="mkt-lead mx-auto mt-4 max-w-2xl">
          The team that builds Dukarun reads every message. Contact us on WhatsApp during Kenyan
          business hours, or email for a reply within one working day.
        </p>
      </div>
    </section>

    <!-- Channels -->
    <section class="bg-base-100 pb-14 sm:pb-20" aria-label="Contact channels">
      <div class="mkt-container grid max-w-4xl gap-4 sm:grid-cols-2">
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
      <div class="mkt-container mt-6 flex max-w-4xl flex-wrap gap-4">
        <a routerLink="/docs" class="link link-primary inline-flex min-h-11 items-center"
          >Read the product help</a
        >
        <a routerLink="/" class="link link-primary inline-flex min-h-11 items-center"
          >Back to the homepage</a
        >
      </div>
    </section>
  `,
})
export class ContactComponent {
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
  ];
}

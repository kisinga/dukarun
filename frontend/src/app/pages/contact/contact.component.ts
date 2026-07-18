import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { FooterComponent } from '../../shell/layout/footer/footer.component';
import { NavbarComponent } from '../../shell/layout/navbar/navbar.component';
import { SEOService } from '../../shared/services/seo.service';

interface Channel {
  icon: string;
  title: string;
  copy: string;
  linkText: string;
  linkHref: string;
  external: boolean;
}

@Component({
  selector: 'app-contact',
  imports: [RouterLink, NavbarComponent, FooterComponent, NgIcon],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent implements OnInit {
  private readonly seo = inject(SEOService);

  protected readonly channels: Channel[] = [
    {
      icon: 'heroPhone',
      title: 'WhatsApp',
      copy: 'Fastest, by far. Questions, quotes, setup help; one chat covers all of it.',
      linkText: '+254 788 922 222',
      linkHref: 'https://wa.me/254788922222',
      external: true,
    },
    {
      icon: 'heroEnvelope',
      title: 'Email',
      copy: 'For anything that needs a paper trail. We reply within 24 hours.',
      linkText: 'hello@dukarun.com',
      linkHref: 'mailto:hello@dukarun.com',
      external: true,
    },
    {
      icon: 'heroQuestionMarkCircle',
      title: 'Support',
      copy: 'Using dukarun already? The support page answers the questions everyone asks.',
      linkText: 'Browse support',
      linkHref: '/support',
      external: false,
    },
    {
      icon: 'heroBuildingStorefront',
      title: 'Enterprise',
      copy: 'Chains, custom setups, integrations. A conversation, not a checkout button.',
      linkText: 'hello@dukarun.com',
      linkHref: 'mailto:hello@dukarun.com',
      external: true,
    },
  ];

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Contact Dukarun: Talk to a Human',
      description:
        'WhatsApp or email the Dukarun team. Questions about pricing, setup, or running the POS for your shop or service business in Kenya. We reply within 24 hours.',
      url: 'https://dukarun.com/contact',
    });
  }
}

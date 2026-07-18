import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { FooterComponent } from '../../shell/layout/footer/footer.component';
import { NavbarComponent } from '../../shell/layout/navbar/navbar.component';
import { SEOService } from '../../shared/services/seo.service';

interface Belief {
  icon: string;
  title: string;
  copy: string;
}

interface Difference {
  icon: string;
  title: string;
  copy: string;
}

@Component({
  selector: 'app-about',
  imports: [RouterLink, NavbarComponent, FooterComponent, NgIcon],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit {
  private readonly seo = inject(SEOService);

  protected readonly beliefs: Belief[] = [
    {
      icon: 'heroSignalSlash',
      title: 'Tools that work on your worst day',
      copy: 'Power cuts and weak internet are not edge cases; they are Tuesday. Every business owner deserves tools that work when they need them, even without perfect internet.',
    },
    {
      icon: 'heroMapPin',
      title: 'Made for Kenya, not adapted for it',
      copy: 'Built with M-Pesa, cash payments, and offline-first in mind from the first line of code. We understand the unique challenges Kenyan businesses face.',
    },
    {
      icon: 'heroUsers',
      title: 'Your success is the business model',
      copy: 'When you succeed, we succeed. We stay committed to ongoing support and to building the features that matter to you, not the ones that demo well.',
    },
  ];

  protected readonly differences: Difference[] = [
    {
      icon: 'heroCamera',
      title: 'Point and sell',
      copy: 'No barcode scanner needed. Point your phone at products and sell instantly.',
    },
    {
      icon: 'heroSignalSlash',
      title: 'Works offline',
      copy: 'Keep selling even when internet is down. Everything syncs when you reconnect.',
    },
    {
      icon: 'heroScale',
      title: 'Built-in accounting',
      copy: 'Every sale and purchase automatically posts to a double-entry ledger, the single source of truth for your business finances.',
    },
    {
      icon: 'heroBanknotes',
      title: 'M-Pesa ready',
      copy: 'Track M-Pesa payments automatically in your ledger. Record receipts from your existing Till with full accounting integration.',
    },
  ];

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'About Dukarun: POS Built for Kenyan Shops & Services',
      description:
        'Why Dukarun exists: a fast, modern point-and-sell POS for Kenyan dukas, agrovets, salons and service businesses. Offline-ready, M-Pesa, and professional accounting made simple.',
      url: 'https://dukarun.com/about',
    });
  }
}

import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../core/layout/footer/footer.component';
import { NavbarComponent } from '../../core/layout/navbar/navbar.component';
import { SEOService } from '../../core/services/seo.service';

@Component({
  selector: 'app-about',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit {
  private readonly seo = inject(SEOService);
  protected readonly currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'About Dukarun — POS Built for Kenyan Shops & Services',
      description:
        'Why Dukarun exists: a fast, modern point-and-sell POS for Kenyan dukas, agrovets, salons and service businesses. Offline-ready, M-Pesa, and professional accounting made simple.',
      url: 'https://dukarun.com/about',
    });
  }
}

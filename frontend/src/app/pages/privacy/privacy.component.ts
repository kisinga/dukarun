import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../shell/layout/footer/footer.component';
import { NavbarComponent } from '../../shell/layout/navbar/navbar.component';
import { SEOService } from '../../shared/services/seo.service';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent implements OnInit {
  private readonly seo = inject(SEOService);
  protected readonly lastUpdated = '2024-01-01';

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Privacy Policy | Dukarun',
      description:
        'How Dukarun collects, uses, and protects your business data. Your information is encrypted, kept private, and never sold.',
      url: 'https://dukarun.com/privacy',
    });
  }
}

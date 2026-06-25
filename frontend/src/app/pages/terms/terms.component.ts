import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../core/layout/footer/footer.component';
import { NavbarComponent } from '../../core/layout/navbar/navbar.component';
import { SEOService } from '../../core/services/seo.service';

@Component({
  selector: 'app-terms',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsComponent implements OnInit {
  private readonly seo = inject(SEOService);
  protected readonly lastUpdated = '2024-01-01';

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Terms of Service | Dukarun',
      description:
        'The terms that govern your use of Dukarun, the point-and-sell POS for Kenyan retail and service businesses.',
      url: 'https://dukarun.com/terms',
    });
  }
}

import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../shell/layout/footer/footer.component';
import { NavbarComponent } from '../../shell/layout/navbar/navbar.component';
import { SEOService } from '../../shared/services/seo.service';

@Component({
  selector: 'app-contact',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent implements OnInit {
  private readonly seo = inject(SEOService);

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Contact Dukarun — Talk to Sales & Support',
      description:
        'Get in touch with the Dukarun team. Questions about pricing, setup, or running the POS for your shop or service business in Kenya — we are happy to help.',
      url: 'https://dukarun.com/contact',
    });
  }
}

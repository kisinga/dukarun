import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { FooterComponent } from '../../shell/layout/footer/footer.component';
import { NavbarComponent } from '../../shell/layout/navbar/navbar.component';
import { SEOService } from '../../shared/services/seo.service';

interface FaqItem {
  question: string;
  answer: string;
}

interface Resource {
  icon: string;
  title: string;
  copy: string;
  linkText: string;
  linkRoute: string;
}

@Component({
  selector: 'app-support',
  imports: [RouterLink, NavbarComponent, FooterComponent, NgIcon],
  templateUrl: './support.component.html',
  styleUrl: './support.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportComponent implements OnInit {
  private readonly seo = inject(SEOService);

  protected readonly resources: Resource[] = [
    {
      icon: 'heroBookOpen',
      title: 'The guide',
      copy: 'From sign-up to first sale, and everything after. Step-by-step, in plain words.',
      linkText: 'Read the guide',
      linkRoute: '/onboarding',
    },
    {
      icon: 'heroPhone',
      title: 'Talk to a human',
      copy: "Can't find your answer? Message us on WhatsApp or email; a person replies.",
      linkText: 'Contact support',
      linkRoute: '/contact',
    },
  ];

  protected readonly faqItems: FaqItem[] = [
    {
      question: 'How do I get started with dukarun?',
      answer:
        "Sign up for a free trial. No credit card required. Add your products by scanning barcodes or taking photos, and you're ready to start selling.",
    },
    {
      question: 'Does dukarun work without internet?',
      answer:
        'Yes! You can record up to 30 sales without internet. Everything is stored on your device and syncs automatically when you reconnect.',
    },
    {
      question: 'How do I add products?',
      answer:
        'You can add products by scanning barcodes or taking photos of price labels. dukarun learns each product in under a minute.',
    },
    {
      question: 'Can I accept M-Pesa payments?',
      answer:
        'Yes! dukarun tracks M-Pesa payments automatically in your ledger. Record M-Pesa receipts from your existing Till number with full accounting integration. Customer-initiated M-Pesa payments (STK Push) are coming soon.',
    },
    {
      question: 'How do I track customer credit?',
      answer:
        'Set credit limits for customers in their profile. The system automatically checks limits before allowing credit sales and sends payment reminders.',
    },
    {
      question: 'Can multiple people use the same account?',
      answer:
        'Yes! Add team members to your account and set different permission levels. Owners see everything, cashiers can only sell, managers can adjust prices.',
    },
    {
      question: 'What happens after my trial ends?',
      answer:
        'After your free trial, you can upgrade to a paid plan to keep using all features, or pause your account. You can upgrade anytime.',
    },
    {
      question: 'Is my data safe?',
      answer:
        'Yes. Your business data is encrypted and kept private. We never share your information. Security is a top priority.',
    },
  ];

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Support & FAQ: Dukarun POS Help',
      description:
        'Answers to common Dukarun questions: getting started, offline selling, adding products, M-Pesa, customer credit, team access and more. Help for Kenyan shops and service businesses.',
      url: 'https://dukarun.com/support',
    });
  }
}

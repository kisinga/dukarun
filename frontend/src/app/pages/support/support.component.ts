import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../core/layout/footer/footer.component';
import { NavbarComponent } from '../../core/layout/navbar/navbar.component';

interface FAQItem {
  question: string;
  answer: string;
  open: boolean;
}

@Component({
  selector: 'app-support',
  imports: [RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './support.component.html',
  styleUrl: './support.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportComponent {
  protected readonly faqItems = signal<FAQItem[]>([
    {
      question: 'How do I get started with dukarun?',
      answer:
        "Sign up for a free 30-day trial. No credit card required. Add your products by scanning barcodes or taking photos, and you're ready to start selling.",
      open: false,
    },
    {
      question: 'Does dukarun work without internet?',
      answer:
        'Yes! You can record up to 30 sales without internet. Everything is stored on your device and syncs automatically when you reconnect.',
      open: false,
    },
    {
      question: 'How do I add products?',
      answer:
        'You can add products by scanning barcodes or taking photos of price labels. dukarun learns each product in under a minute.',
      open: false,
    },
    {
      question: 'Can I accept M-Pesa payments?',
      answer:
        'Yes! dukarun tracks M-Pesa payments automatically in your ledger. Record M-Pesa receipts from your existing Till number with full accounting integration. Customer-initiated M-Pesa payments (STK Push) are coming soon.',
      open: false,
    },
    {
      question: 'How do I track customer credit?',
      answer:
        'Set credit limits for customers in their profile. The system automatically checks limits before allowing credit sales and sends payment reminders.',
      open: false,
    },
    {
      question: 'Can multiple people use the same account?',
      answer:
        'Yes! Add team members to your account and set different permission levels. Owners see everything, cashiers can only sell, managers can adjust prices.',
      open: false,
    },
    {
      question: 'What happens after my trial ends?',
      answer:
        'After your free 30-day trial, you can upgrade to Pro (KES 1,500/month) to keep using all features, or pause your account. You can upgrade anytime.',
      open: false,
    },
    {
      question: 'Is my data safe?',
      answer:
        'Yes. Your business data is encrypted and kept private. We never share your information. Security is a top priority.',
      open: false,
    },
  ]);
}

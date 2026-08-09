import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CustomerStatement, StorefrontService } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';

@Component({
  selector: 'app-statement',
  template: `
    <main class="min-h-screen bg-base-200 p-4 py-10">
      <div class="mx-auto max-w-xl">
        @if (loading()) {
          <p class="py-16 text-center text-sm text-base-content/60">Loading statement…</p>
        } @else if (statement(); as s) {
          <section class="card bg-base-100 shadow-sm">
            <div class="card-body p-5 sm:p-7">
              <div class="flex items-center gap-3">
                @if (companyLogoUrl(s.logo_path); as logo) {
                  <img [src]="logo" alt="" class="h-12 w-12 rounded-xl object-cover" />
                }
                <div>
                  <h1 class="text-xl font-bold">{{ s.store_name }}</h1>
                  <p class="text-sm text-base-content/60">Customer statement</p>
                </div>
              </div>
              <div class="mt-6 rounded-box bg-primary/10 p-4">
                <p class="text-sm">Hello {{ s.customer_first_name }}</p>
                <p class="mt-1 text-2xl font-bold tabular-nums">{{ money(s.outstanding_total) }}</p>
                <p class="text-xs text-base-content/60">Total outstanding</p>
              </div>
              <div class="mt-5 overflow-x-auto">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Sale</th>
                      <th>Due</th>
                      <th class="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (order of s.orders; track order.code) {
                      <tr>
                        <td>{{ order.code }}</td>
                        <td>{{ date(order.due_date) }}</td>
                        <td class="text-right font-semibold">{{ money(order.balance) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (s.payment_instructions) {
                <div class="mt-5 rounded-box border border-base-300 p-4">
                  <h2 class="font-semibold">How to pay</h2>
                  <p class="mt-1 whitespace-pre-wrap text-sm text-base-content/70">
                    {{ s.payment_instructions }}
                  </p>
                </div>
              }
              @if (s.whatsapp_number) {
                <a
                  class="btn btn-primary mt-5 min-h-11"
                  [href]="waLink(s.whatsapp_number, s.store_name)"
                  target="_blank"
                  rel="noopener"
                  >Contact {{ s.store_name }}</a
                >
              }
              <p class="mt-4 text-xs text-base-content/50">
                Read-only statement · link expires {{ date(s.expires_at) }}
              </p>
            </div>
          </section>
        } @else {
          <section class="card bg-base-100 p-8 text-center">
            <h1 class="font-bold">Statement unavailable</h1>
            <p class="mt-2 text-sm text-base-content/60">
              This link expired or was replaced. Ask the store for a new reminder.
            </p>
          </section>
        }
        <p class="mt-6 text-center text-xs text-base-content/50">
          <a [href]="legalUrl('privacy')" class="link link-hover">Privacy</a>
          <span aria-hidden="true"> · </span>
          <a [href]="legalUrl('terms')" class="link link-hover">Terms</a>
        </p>
      </div>
    </main>
  `,
})
export class StatementComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly storefront = inject(StorefrontService);
  private readonly seo = inject(StorefrontSeoService);
  protected readonly statement = signal<CustomerStatement | null>(null);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    this.seo.set('Private customer statement', 'Secure customer statement.', '/statement', true);
    try {
      const token = this.route.snapshot.paramMap.get('token');
      if (token) this.statement.set(await this.storefront.customerStatement(token));
    } finally {
      this.loading.set(false);
    }
  }

  protected money(value: number): string {
    return `KES ${Math.round(value).toLocaleString('en-KE')}`;
  }
  protected date(value: string): string {
    return new Date(value).toLocaleDateString('en-KE', { dateStyle: 'medium' });
  }
  protected companyLogoUrl(path: string | null): string | null {
    return this.storefront.companyLogoUrl(path);
  }
  protected waLink(phone: string, store: string): string {
    return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${store}, I have a question about my statement.`)}`;
  }
  protected legalUrl(path: 'privacy' | 'terms'): string {
    return this.storefront.legalUrl(path);
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ExternalDocument, StorefrontService } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';
import { PoweredByDukarunComponent } from './powered-by-dukarun.component';

@Component({
  selector: 'app-document',
  imports: [PoweredByDukarunComponent],
  template: `
    <main class="min-h-screen bg-base-200 p-4 py-8 print:bg-white print:p-0">
      <div class="mx-auto max-w-2xl print:max-w-none">
        @if (loading()) {
          <p class="py-16 text-center text-sm text-base-content/60">Loading document…</p>
        } @else if (document(); as d) {
          <section class="card bg-base-100 shadow-sm print:border-0 print:shadow-none">
            <div class="card-body p-5 sm:p-8 print:p-0">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3">
                  @if (logoUrl(d.company_logo_path); as logo) {
                    <img [src]="logo" alt="" class="h-12 w-12 rounded-xl object-contain" />
                  }
                  <div>
                    <h1 class="text-xl font-bold">{{ d.company_name }}</h1>
                    @if (d.company_address) {
                      <p class="text-sm text-base-content/60">{{ d.company_address }}</p>
                    }
                    @if (d.show_vat_breakdown && d.tax_registration_number) {
                      <p class="text-sm text-base-content/60">
                        Tax PIN: {{ d.tax_registration_number }}
                      </p>
                    }
                  </div>
                </div>
                <button class="btn btn-outline btn-sm print:hidden" type="button" (click)="print()">
                  Print
                </button>
              </div>

              <div
                class="mt-6 flex flex-wrap items-end justify-between gap-3 border-y border-base-300 py-4"
              >
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-base-content/50">
                    {{ title(d) }}
                  </p>
                  <p class="font-mono text-lg font-bold">
                    {{ d.tax_document_number || d.document_number }}
                  </p>
                </div>
                <div class="text-right text-sm">
                  <p>{{ date(d.issue_date) }}</p>
                  @if (d.valid_until) {
                    <p class="text-base-content/60">
                      {{ d.document_type === 'proforma' ? 'Valid until' : 'Due' }}
                      {{ date(d.valid_until) }}
                    </p>
                  }
                </div>
              </div>

              <div class="mt-4 flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs uppercase tracking-wide text-base-content/50">
                    {{ d.document_type === 'purchase_order' ? 'Supplier' : 'Customer' }}
                  </p>
                  <p class="font-semibold">{{ d.party_name }}</p>
                </div>
                <span
                  class="badge"
                  [class.badge-success]="d.status === 'paid'"
                  [class.badge-info]="d.status !== 'paid'"
                >
                  {{ statusLabel(d.status) }}
                </span>
              </div>

              <div class="mt-5 overflow-x-auto print:overflow-visible">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th class="text-right">Qty</th>
                      <th class="text-right">Unit</th>
                      <th class="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of d.lines; track $index) {
                      <tr>
                        <td>{{ line.description }}</td>
                        <td class="text-right">{{ line.quantity }}</td>
                        <td class="text-right">{{ money(line.unit_price) }}</td>
                        <td class="text-right font-semibold">{{ money(line.line_total) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="ml-auto mt-5 grid w-full max-w-xs gap-2 text-sm">
                @if (d.show_vat_breakdown && d.vat_registered) {
                  <div class="flex justify-between">
                    <span>Net amount</span><span>{{ money(d.net_total ?? d.total) }}</span>
                  </div>
                  @for (tax of d.tax_breakdown ?? []; track tax.code + tax.rate_bps) {
                    <div class="flex justify-between">
                      <span>{{ taxLabel(tax) }}</span
                      ><span>{{
                        money(
                          tax.classification === 'standard' || tax.classification === 'special'
                            ? tax.tax
                            : tax.gross
                        )
                      }}</span>
                    </div>
                  }
                  @if ((d.tax_breakdown ?? []).length === 0) {
                    <div class="flex justify-between">
                      <span>VAT</span><span>{{ money(d.tax_total ?? 0) }}</span>
                    </div>
                  }
                }
                <div class="flex justify-between">
                  <span>Total</span><strong>{{ money(d.total) }}</strong>
                </div>
                @if (d.document_type === 'invoice' || d.document_type === 'receipt') {
                  <div class="flex justify-between">
                    <span>Paid</span><span>{{ money(d.paid) }}</span>
                  </div>
                  <div class="flex justify-between border-t border-base-300 pt-2">
                    <span>Balance</span><strong>{{ money(d.balance) }}</strong>
                  </div>
                }
              </div>

              @if (d.notes) {
                <div class="mt-5 rounded-box border border-base-300 p-3 text-sm">
                  <strong>Notes</strong>
                  <p class="mt-1 whitespace-pre-wrap text-base-content/70">{{ d.notes }}</p>
                </div>
              }
              <p class="mt-6 text-xs text-base-content/50 print:hidden">
                Read-only snapshot · secure link expires {{ date(d.expires_at) }}
              </p>
            </div>
          </section>
        } @else {
          <section class="card bg-base-100 p-8 text-center">
            <h1 class="font-bold">Document unavailable</h1>
            <p class="mt-2 text-sm text-base-content/60">
              This secure link is invalid or has expired. Ask the sender for a new copy.
            </p>
          </section>
        }
        <p class="mt-6 text-center text-xs text-base-content/50 print:hidden">
          <app-powered-by-dukarun />
          <span aria-hidden="true"> · </span>
          <a [href]="legalUrl('privacy')" class="link link-hover">Privacy</a>
          <span aria-hidden="true"> · </span>
          <a [href]="legalUrl('terms')" class="link link-hover">Terms</a>
        </p>
      </div>
    </main>
  `,
  styles: `
    @page {
      size: A4 portrait;
      margin: 14mm;
    }

    @media print {
      :host {
        color: #111;
      }

      .rounded-box {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      th,
      td {
        overflow-wrap: anywhere;
      }
    }
  `,
})
export class DocumentComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly storefront = inject(StorefrontService);
  private readonly seo = inject(StorefrontSeoService);
  protected readonly document = signal<ExternalDocument | null>(null);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    this.seo.set('Private business document', 'Secure business document.', '/document', true);
    try {
      const token = this.route.snapshot.paramMap.get('token');
      if (token) this.document.set(await this.storefront.externalDocument(token));
    } finally {
      this.loading.set(false);
    }
  }

  protected title(document: ExternalDocument): string {
    if (document.document_type === 'purchase_order') return 'Purchase order';
    if (document.document_type === 'proforma') return 'Proforma';
    if (document.show_vat_breakdown && document.vat_registered) return 'VAT Invoice';
    const type = document.document_type;
    return type[0].toUpperCase() + type.slice(1);
  }
  protected taxLabel(tax: NonNullable<ExternalDocument['tax_breakdown']>[number]): string {
    if (tax.classification === 'zero_rated') return 'Zero-rated VAT';
    if (tax.classification === 'exempt') return 'VAT exempt';
    return `VAT ${tax.rate_bps / 100}%`;
  }
  protected statusLabel(status: string): string {
    return status[0]?.toUpperCase() + status.slice(1);
  }
  protected money(value: number): string {
    return `KES ${Math.round(value).toLocaleString('en-KE')}`;
  }
  protected date(value: string): string {
    return new Date(value).toLocaleDateString('en-KE', { dateStyle: 'medium' });
  }
  protected logoUrl(path: string | null): string | null {
    return this.storefront.companyLogoUrl(path);
  }
  protected print(): void {
    window.print();
  }
  protected legalUrl(path: 'privacy' | 'terms'): string {
    return this.storefront.legalUrl(path);
  }
}

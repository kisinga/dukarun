import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { externalDocumentContent, renderDocument, type RenderedDocument } from '@dukarun/documents';
import { ExternalDocument, StorefrontService } from './storefront.service';
import { StorefrontSeoService } from './storefront-seo.service';
import { PoweredByDukarunComponent } from './powered-by-dukarun.component';
import { DocumentViewComponent } from './document-view.component';

@Component({
  selector: 'app-document',
  imports: [PoweredByDukarunComponent, DocumentViewComponent],
  template: `
    <main class="min-h-screen bg-base-200 p-4 py-8">
      <div class="mx-auto max-w-3xl">
        @if (loading()) {
          <p role="status" class="py-16 text-center">Loading document…</p>
        } @else if (document(); as d) {
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm">Read-only snapshot · secure link expires {{ date(d.expires_at) }}</p>
            <button
              class="btn btn-outline"
              type="button"
              [disabled]="!rendered()"
              (click)="print()"
            >
              Print
            </button>
          </div>
          @if (rendered(); as content) {
            <app-document-view [document]="content" />
          }
        } @else {
          <section class="card bg-base-100 p-8 text-center">
            <h1 class="font-bold">Document unavailable</h1>
            <p>This secure link is invalid or has expired. Ask the sender for a new copy.</p>
          </section>
        }
        @if (error()) {
          <p role="alert" class="alert alert-error mt-3">{{ error() }}</p>
        }
        <p class="mt-6 text-center text-xs text-base-content/60">
          <app-powered-by-dukarun /> · <a [href]="legalUrl('privacy')" class="link">Privacy</a> ·
          <a [href]="legalUrl('terms')" class="link">Terms</a>
        </p>
      </div>
    </main>
  `,
})
export class DocumentComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly storefront = inject(StorefrontService);
  private readonly seo = inject(StorefrontSeoService);
  protected readonly document = signal<ExternalDocument | null>(null);
  protected readonly rendered = signal<RenderedDocument | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly view = viewChild(DocumentViewComponent);
  async ngOnInit(): Promise<void> {
    this.seo.set('Private business document', 'Secure business document.', '/document', true);
    try {
      const token = this.route.snapshot.paramMap.get('token');
      const d = token ? await this.storefront.externalDocument(token) : null;
      this.document.set(d);
      if (d)
        this.rendered.set(
          renderDocument(
            externalDocumentContent(d, {
              name: d.company_name,
              address: d.company_address,
              logoUrl: this.storefront.companyLogoUrl(d.company_logo_path),
              email: d.company_email,
              phone: d.company_whatsapp,
              website: d.company_website,
              taxNumber: d.tax_registration_number,
            }),
            d.document_design
          )
        );
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : 'The document could not be loaded. Please try again.'
      );
    } finally {
      this.loading.set(false);
    }
  }
  protected async print(): Promise<void> {
    try {
      await this.view()?.print();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Printing failed. Please try again.');
    }
  }
  protected date(value: string): string {
    return new Date(value).toLocaleDateString('en-KE', { dateStyle: 'medium' });
  }
  protected legalUrl(path: 'privacy' | 'terms'): string {
    return this.storefront.legalUrl(path);
  }
}

import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { renderDocument, sampleDocument } from '@dukarun/documents';
import { ButtonComponent } from '../shared/ui/button.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { DocumentPreviewComponent } from '../shared/print/document-preview.component';
import { TaxService, type CompanyTaxSettings } from '../core/tax.service';
import { PrintService } from '../shared/print/print.service';
import { ShopProfileComponent } from './shop-profile.component';
import { ShopAddressComponent } from './shop-address.component';
import { ShopSetupCoordinator } from './shop-setup-coordinator.service';

@Component({
  selector: 'app-shop-setup',
  imports: [
    RouterLink,
    ButtonComponent,
    PageLayoutComponent,
    ShopProfileComponent,
    ShopAddressComponent,
    DocumentPreviewComponent,
  ],
  template: `
    <app-page
      title="Shop setup"
      subtitle="Get your shop ready, then explore your first business cycle."
    >
      @if (loading()) {
        <p role="status">Loading your shop…</p>
      } @else {
        <div class="space-y-4">
          @if (error()) {
            <p role="alert" class="text-error">{{ error() }}</p>
            <button appButton variant="outline" (click)="load()">Retry</button>
          }
          @if (setup.store.settings()) {
            <ol class="flex flex-wrap gap-2" aria-label="Setup steps">
              @for (title of steps; track $index) {
                <li>
                  <button
                    appButton
                    [variant]="step() === $index ? 'primary' : 'ghost'"
                    [attr.aria-current]="step() === $index ? 'step' : null"
                    [disabled]="busy()"
                    (click)="chooseStep($index)"
                  >
                    {{ $index + 1 }}. {{ title }}
                  </button>
                </li>
              }
            </ol>
            @if (step() === 0) {
              <app-shop-profile saveLabel="Save and continue" (saved)="identitySaved()" />
            } @else if (step() === 1) {
              <app-shop-address saveLabel="Save and continue" (saved)="addressSaved()" /><button
                appButton
                variant="ghost"
                [disabled]="busy()"
                (click)="deferAddress()"
              >
                Choose an address later
              </button>
            } @else if (step() === 2) {
              <section class="card bg-base-100">
                <div class="card-body p-4">
                  <h2 class="section-title">Your documents are ready</h2>
                  <p class="type-caption">
                    Every document starts with Classic and your saved shop details. You can change
                    any design later.
                  </p>
                  @if (preview(); as document) {
                    <app-document-preview [document]="document" />
                  }
                  <div class="flex flex-wrap justify-end gap-2">
                    <button appButton variant="outline" (click)="testPrint()">Print sample</button
                    ><a
                      appButton
                      variant="outline"
                      routerLink="/settings/documents"
                      [queryParams]="{ from: 'setup' }"
                    >
                      Customize documents</a
                    ><button appButton [loading]="busy()" (click)="documentsReviewed()">
                      Use these defaults and continue
                    </button>
                  </div>
                </div>
              </section>
            } @else {
              <section class="card bg-base-100">
                <div class="card-body p-4">
                  <h2 class="section-title">
                    {{ setup.ready() ? 'Your shop basics are ready' : 'Your setup progress' }}
                  </h2>
                  <ul class="space-y-2">
                    @for (task of setup.tasks(); track task.key) {
                      <li class="flex flex-wrap justify-between gap-2">
                        <span>{{ task.label }}</span
                        ><span class="type-caption">{{
                          task.status === 'done'
                            ? 'Done'
                            : task.status === 'optional'
                              ? 'Optional / deferred'
                              : 'Needs attention'
                        }}</span>
                      </li>
                    }
                  </ul>
                  <p>
                    Learn the product, purchasing and selling workflow at your own pace. These
                    optional guides use your existing learning progress.
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <a appButton routerLink="/learn/first-business-cycle"
                      >Continue your first business cycle</a
                    ><a appButton variant="outline" routerLink="/dashboard">Go to dashboard</a>
                  </div>
                </div>
              </section>
            }
            @if (step() < 3) {
              <button appButton variant="ghost" [disabled]="busy()" (click)="later()">
                Finish setup later
              </button>
            }
          }
        </div>
      }
    </app-page>
  `,
})
export class ShopSetupComponent implements OnInit {
  readonly setup = inject(ShopSetupCoordinator);
  private readonly print = inject(PrintService);
  private readonly tax = inject(TaxService);
  private readonly taxSettings = signal<CompanyTaxSettings | null>(null);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly steps = ['Shop identity', 'Shop web address', 'Your documents'];
  readonly step = signal(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private readonly profile = viewChild(ShopProfileComponent);
  private readonly address = viewChild(ShopAddressComponent);
  readonly preview = computed(() => {
    const s = this.setup.store.settings();
    const tax = this.taxSettings();
    const profile = tax?.active_profile;
    const category = tax?.categories?.find(c => c.id === profile?.default_tax_category_id);
    const show =
      s?.document_designs?.receipt?.showVatBreakdown ?? tax?.show_vat_breakdown_on_prints ?? false;
    return s
      ? renderDocument(
          sampleDocument(
            'receipt',
            {
              name: s.name,
              address: s.address,
              email: s.email,
              phone: s.public_whatsapp_number,
              website: s.website_url,
              logoUrl: s.logo_path ? this.setup.store.logoPublicUrl(s.logo_path) : null,
              taxNumber: show && profile?.vat_registered ? profile.tax_registration_number : null,
            },
            {
              registered: !!profile?.vat_registered && category?.rate_bps != null,
              showBreakdown: show,
              rateBps: category?.rate_bps ?? 0,
              classification: category?.classification,
            },
            this.print.format()
          ),
          s.document_designs?.receipt,
          this.print.format()
        )
      : null;
  });
  async ngOnInit(): Promise<void> {
    await this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.setup.store.load();
      this.taxSettings.set(await this.tax.settings().catch(() => null));
      await this.setup.offered();
      this.step.set(
        this.route.snapshot.queryParamMap.get('step') === 'documents' ? 2 : this.setup.nextStep()
      );
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading.set(false);
    }
  }
  canDeactivate(): boolean {
    return (
      !(this.profile()?.dirty() || this.address()?.slug.dirty) ||
      window.confirm('Discard unsaved shop changes?')
    );
  }
  chooseStep(step: number): void {
    if (this.canDeactivate()) this.step.set(step);
  }
  async identitySaved(): Promise<void> {
    await this.progress({ identity_reviewed: true }, 1);
  }
  async addressSaved(): Promise<void> {
    await this.progress({ address_deferred: false }, 2);
  }
  async deferAddress(): Promise<void> {
    await this.progress({ address_deferred: true }, 2);
  }
  async documentsReviewed(): Promise<void> {
    await this.progress({ documents_reviewed: true, deferred: false }, 3);
    if (this.step() === 3)
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { step: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
  }
  private async progress(
    patch: Parameters<typeof this.setup.store.saveSetup>[0],
    step: number
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.setup.store.saveSetup(patch);
      this.step.set(step);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }
  async later(): Promise<void> {
    if (!this.canDeactivate()) return;
    try {
      await this.setup.offered(true);
      this.profile()?.discard();
      this.address()?.reset();
      await this.router.navigateByUrl('/dashboard');
    } catch (e) {
      this.fail(e);
    }
  }
  async testPrint(): Promise<void> {
    const doc = this.preview();
    if (!doc) return;
    try {
      await this.print.printDocument(doc.title, doc.html, doc.styles);
    } catch (e) {
      this.fail(e);
    }
  }
  private fail(e: unknown): void {
    this.error.set(
      e instanceof Error ? e.message : 'Setup could not be saved. Your entries are still available.'
    );
  }
}

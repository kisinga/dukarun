import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  defaultDesign,
  readDesign,
  renderDocument,
  sampleDocument,
  type DocumentDesign,
  type DocumentDesigns,
  type DocumentKind,
  type DocumentLayout,
  type PaperFormat,
  type PreparedQr,
  type RenderedDocument,
} from '@dukarun/documents';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import {
  DocumentPreviewComponent,
  type PreviewSection,
} from '../shared/print/document-preview.component';
import { PrintService } from '../shared/print/print.service';
import { prepareDocumentQr } from '../shared/print/document-qr';
import { TaxService, type CompanyTaxSettings } from '../core/tax.service';
import { CompanySettingsStore } from './company-settings.store';

@Component({
  selector: 'app-document-designer',
  imports: [
    FormsModule,
    RouterLink,
    PageLayoutComponent,
    PageActionsComponent,
    ButtonComponent,
    FormFieldComponent,
    DocumentPreviewComponent,
  ],
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
  template: `
    <app-page
      title="Document designs"
      subtitle="Edit a design. See changes as you type."
      [wide]="true"
    >
      <app-page-actions actions
        ><a
          utilityAction
          appButton
          variant="ghost"
          [routerLink]="fromSetup ? '/shop-setup' : '/settings'"
          [queryParams]="fromSetup ? { step: 'documents' } : { tab: 'business' }"
          >{{ fromSetup ? 'Back to setup' : 'Back to settings' }}</a
        ></app-page-actions
      >
      @if (error()) {
        <p role="alert" class="alert alert-error mb-3">{{ error() }}</p>
      }
      @if (loading()) {
        <p role="status">Loading document designs…</p>
      }
      @if (store.settings()) {
        <div class="mb-4 flex gap-2 lg:hidden" role="tablist" aria-label="Designer view">
          <button
            appButton
            [variant]="mobileView() === 'edit' ? 'primary' : 'outline'"
            role="tab"
            id="edit-tab"
            aria-controls="design-controls"
            [attr.aria-selected]="mobileView() === 'edit'"
            (click)="mobileView.set('edit')"
          >
            Edit
          </button>
          <button
            appButton
            [variant]="mobileView() === 'preview' ? 'primary' : 'outline'"
            role="tab"
            id="preview-tab"
            aria-controls="design-preview"
            [attr.aria-selected]="mobileView() === 'preview'"
            (click)="mobileView.set('preview')"
          >
            Preview
          </button>
        </div>
        <div
          class="designer-grid grid min-w-0 gap-4 lg:grid-cols-[minmax(20rem,2fr)_minmax(0,3fr)]"
        >
          <section
            id="design-controls"
            aria-label="Document controls"
            class="min-w-0 space-y-3 lg:block"
            [class.hidden]="mobileView() !== 'edit'"
          >
            <div class="card bg-base-100 p-4 space-y-3">
              <div class="grid gap-3 sm:grid-cols-2">
                <app-form-field label="Document"
                  ><select
                    class="select select-bordered w-full"
                    [ngModel]="kind()"
                    (ngModelChange)="kind.set($event)"
                    [disabled]="busy()"
                  >
                    @for (type of types; track type) {
                      <option [value]="type">
                        {{ labels[type] }}{{ changed(type) ? ' (unsaved)' : '' }}
                      </option>
                    }
                  </select></app-form-field
                >
                <app-form-field label="Paper"
                  ><select
                    class="select select-bordered w-full"
                    [ngModel]="effectivePaper()"
                    (ngModelChange)="paper.set($event)"
                  >
                    @if (kind() !== 'statement' && kind() !== 'purchase-order') {
                      <option value="receipt-52mm">52 mm receipt</option>
                      <option value="receipt-80mm">80 mm receipt</option>
                    }
                    <option value="a4">A4</option>
                  </select></app-form-field
                >
              </div>
              <fieldset>
                <legend class="form-field-label">Layout</legend>
                <div class="grid grid-cols-3 gap-2">
                  @for (layout of layouts; track layout.key) {
                    <label
                      class="design-choice flex cursor-pointer items-center justify-center gap-2 rounded-field border border-base-300 px-2 py-2.5"
                      [title]="layout.description"
                    >
                      <input
                        type="radio"
                        class="radio radio-sm"
                        name="document-layout"
                        [checked]="draft().layout === layout.key"
                        (change)="setLayout(layout.key)"
                      />
                      <span class="text-sm font-medium">{{ layout.label }}</span>
                    </label>
                  }
                </div>
              </fieldset>
              <div
                class="flex items-center justify-between gap-3 border-t border-base-300 pt-3"
                (focusin)="activeSection.set('identity')"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{{ store.settings()?.name }}</p>
                  <p class="type-caption">Shop details shared by all designs</p>
                </div>
                <a
                  class="link shrink-0 text-sm"
                  routerLink="/settings"
                  [queryParams]="{ tab: 'business' }"
                  >Edit shop details</a
                >
              </div>
            </div>
            <div class="card bg-base-100 p-4 space-y-4">
              <app-form-field
                [label]="kind() === 'receipt' ? 'Receipt message' : 'Message or terms (optional)'"
                hint="Up to 1,000 characters"
              >
                <textarea
                  class="textarea textarea-bordered w-full"
                  rows="2"
                  maxlength="1000"
                  [ngModel]="draft().message"
                  (focus)="activeSection.set('message')"
                  (ngModelChange)="patch({ message: $event })"
                ></textarea>
              </app-form-field>
              <fieldset class="space-y-3" (focusin)="activeSection.set('custom')">
                <legend class="section-title mb-2">Text & QR code</legend>
                <app-form-field
                  label="Text or link"
                  hint="What customers will read or scan · up to 300 characters"
                >
                  <input
                    class="input input-bordered w-full"
                    maxlength="300"
                    placeholder="https://example.com"
                    [ngModel]="draft().custom.value"
                    (ngModelChange)="custom('value', $event)"
                  />
                </app-form-field>
                <fieldset>
                  <legend class="form-field-label">Show it as</legend>
                  <div class="grid grid-cols-3 gap-2">
                    @for (mode of displayModes; track mode.value) {
                      <label
                        class="design-choice flex cursor-pointer items-center justify-center gap-1.5 rounded-field border border-base-300 px-1.5 py-2.5"
                      >
                        <input
                          type="radio"
                          class="radio radio-sm"
                          name="custom-display"
                          [checked]="draft().custom.display === mode.value"
                          (change)="custom('display', mode.value)"
                        />
                        <span class="text-sm leading-tight">{{ mode.label }}</span>
                      </label>
                    }
                  </div>
                </fieldset>
                @if (!draft().custom.value.trim()) {
                  <p class="type-caption">
                    Enter text or a link to display it or generate your QR code.
                  </p>
                }
                @if (previewError()) {
                  <p role="alert" class="text-error">{{ previewError() }}</p>
                }
                @if (captionOpen() || draft().custom.label) {
                  <app-form-field label="Caption (optional)">
                    <input
                      class="input input-bordered w-full"
                      maxlength="60"
                      placeholder="Website"
                      [ngModel]="draft().custom.label"
                      (ngModelChange)="custom('label', $event)"
                    />
                  </app-form-field>
                } @else {
                  <button appButton variant="ghost" type="button" (click)="captionOpen.set(true)">
                    Add a caption
                  </button>
                }
              </fieldset>
            </div>
            @if (kind() !== 'statement' && kind() !== 'purchase-order') {
              <section
                class="card bg-base-100 p-4 space-y-2"
                (focusin)="activeSection.set('totals')"
              >
                <div class="flex items-center justify-between gap-3">
                  <h2 class="section-title">VAT on this document</h2>
                  <a class="link text-sm" routerLink="/settings" [queryParams]="{ tab: 'money' }"
                    >VAT settings</a
                  >
                </div>
                <p class="type-caption">{{ taxStatus() }}</p>
                <label class="flex items-center gap-3"
                  ><input
                    type="checkbox"
                    class="toggle"
                    [checked]="showVat()"
                    [disabled]="!taxSettings()"
                    (change)="patch({ showVatBreakdown: $any($event.target).checked })"
                  />Show VAT breakdown</label
                >
                <p class="type-caption">
                  Adds net amount and VAT below the items. Prices stay VAT-inclusive. Change VAT
                  calculation in VAT settings.
                </p>
                @if (draft().showVatBreakdown !== undefined) {
                  <button appButton variant="ghost" (click)="inheritVat()">
                    Use shared print setting
                  </button>
                }
              </section>
            }
          </section>
          <section
            id="design-preview"
            aria-label="Sample preview"
            class="preview-panel min-w-0 self-start lg:block"
            [class.hidden]="mobileView() !== 'preview'"
          >
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="section-title">Sample preview</h2>
              <span class="type-caption">{{
                vatExample()
                  ? 'VAT layout example · creates no transaction'
                  : 'Creates no transaction'
              }}</span>
            </div>
            <div
              class="preview-scroll overflow-auto overscroll-contain rounded-field border border-base-300 bg-base-300/30"
              tabindex="0"
              aria-label="Scrollable document preview"
            >
              @if (preview(); as document) {
                <app-document-preview [document]="document" [activeSection]="activeSection()" />
              }
            </div>
            <p class="mt-2 type-caption">
              {{
                effectivePaper() === 'a4'
                  ? 'A4'
                  : effectivePaper() === 'receipt-52mm'
                    ? '52 mm receipt'
                    : '80 mm receipt'
              }}
              · Preview fits your screen
            </p>
          </section>
        </div>
        <footer
          class="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-field border border-base-300 bg-base-100 p-3"
        >
          <p role="status" class="type-caption">
            {{ notice() || (dirty() ? 'Unsaved changes' : 'All changes saved') }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button appButton variant="ghost" [disabled]="busy()" (click)="restore()">
              Restore defaults
            </button>
            <button
              appButton
              variant="ghost"
              [disabled]="busy() || !changed(kind())"
              (click)="discard()"
            >
              Discard changes
            </button>
            <button
              appButton
              variant="outline"
              [disabled]="busy() || !preview()"
              (click)="testPrint()"
            >
              Test print
            </button>
            <button appButton [loading]="busy()" (click)="save()">
              Save {{ labels[kind()].toLowerCase() }}
            </button>
          </div>
        </footer>
      }
    </app-page>
  `,
  styles: `
    .design-choice:has(input:checked) {
      border-color: var(--color-primary);
      background: color-mix(in oklab, var(--color-primary) 6%, var(--color-base-100));
    }
    .design-choice:focus-within {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    #design-controls :is(input, textarea, select, button, a) {
      scroll-margin-block: 5rem;
    }
    @media (min-width: 1024px) {
      .designer-grid {
        flex: 1;
        min-height: 0;
      }
      #design-controls {
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
        padding-right: 0.5rem;
        scroll-padding-block: 0.5rem;
      }
      #design-controls :is(input, textarea, select, button, a) {
        scroll-margin-block: 0.5rem;
      }
      .preview-panel {
        display: flex;
        flex-direction: column;
        align-self: stretch;
        min-height: 0;
      }
      .preview-scroll {
        flex: 1;
        min-height: 0;
      }
    }
  `,
})
export class DocumentDesignerComponent implements OnInit {
  readonly store = inject(CompanySettingsStore);
  private readonly print = inject(PrintService);
  private readonly tax = inject(TaxService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly fromSetup = this.route.snapshot.queryParamMap.get('from') === 'setup';
  readonly types = DOCUMENT_TYPES;
  readonly labels = DOCUMENT_LABELS;
  readonly layouts: { key: DocumentLayout; label: string; description: string }[] = [
    { key: 'classic', label: 'Classic', description: 'Familiar and balanced' },
    { key: 'compact', label: 'Compact', description: 'Less space, clear detail' },
    { key: 'modern', label: 'Modern', description: 'Strong headings and totals' },
  ];
  readonly displayModes = [
    { value: 'text', label: 'Text', example: 'Aa' },
    { value: 'qr', label: 'QR code', example: '▦' },
    { value: 'both', label: 'Text and QR', example: 'Aa ▦' },
  ] as const;
  readonly kind = signal<DocumentKind>('receipt');
  readonly paper = signal<PaperFormat>(this.print.format());
  readonly effectivePaper = computed(() =>
    ['statement', 'purchase-order'].includes(this.kind()) ? 'a4' : this.paper()
  );
  readonly mobileView = signal<'edit' | 'preview'>('edit');
  readonly activeSection = signal<PreviewSection>(null);
  readonly captionOpen = signal(false);
  readonly loading = signal(false);
  private readonly drafts = signal<DocumentDesigns>({});
  readonly draft = computed(
    () =>
      this.drafts()[this.kind()] ??
      readDesign(this.kind(), this.store.settings()?.document_designs?.[this.kind()])
  );
  readonly dirty = computed(() => this.types.some(type => this.changed(type)));
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly previewError = signal<string | null>(null);
  readonly taxSettings = signal<CompanyTaxSettings | null>(null);
  private readonly sampleTaxCategory = computed(() => {
    const settings = this.taxSettings();
    return (
      settings?.categories?.find(c => c.id === settings.active_profile?.default_tax_category_id) ??
      settings?.categories?.find(c => c.is_default)
    );
  });
  readonly vatExample = computed(
    () =>
      this.showVat() &&
      !this.taxSettings()?.active_profile?.vat_registered &&
      this.sampleTaxCategory()?.rate_bps != null &&
      !['statement', 'purchase-order'].includes(this.kind())
  );
  readonly taxStatus = computed(() => {
    if (!this.taxSettings())
      return 'VAT status is unavailable. Reopen the designer when connected to refresh it.';
    if (this.showVat() && this.sampleTaxCategory()?.rate_bps == null)
      return 'No current VAT rate is configured for this shop. Check VAT settings to preview a breakdown.';
    if (this.taxSettings()!.active_profile?.vat_registered)
      return 'VAT calculation is on. Prices include VAT.';
    return this.vatExample()
      ? 'VAT calculation is off for sales. The preview shows a layout example using your configured rate.'
      : 'VAT calculation is off for sales. Turn on this display option to preview a VAT layout example.';
  });
  readonly showVat = computed(
    () => this.draft().showVatBreakdown ?? this.taxSettings()?.show_vat_breakdown_on_prints ?? false
  );
  private readonly qrValue = computed(() =>
    this.draft().custom.display !== 'text' && this.draft().custom.value.trim()
      ? this.draft().custom.value
      : ''
  );
  private readonly qrResult = signal<{ value: string; qr: PreparedQr } | null>(null);
  private readonly qrCache = new Map<string, Promise<PreparedQr>>();
  readonly preview = computed<RenderedDocument | null>(() => {
    if (!this.store.settings()) return null;
    const design = structuredClone(this.draft());
    const result = this.qrResult();
    if (result?.value === design.custom.value) design.custom.qr = result.qr;
    return this.render(design, true);
  });

  constructor() {
    effect(onCleanup => {
      const value = this.qrValue();
      this.previewError.set(null);
      if (!value) return;
      let active = true;
      const timer = setTimeout(() => {
        void this.qr(value)
          .then(qr => {
            if (active) this.qrResult.set({ value, qr });
          })
          .catch(error => {
            if (active)
              this.previewError.set(
                error instanceof Error ? error.message : 'QR code could not be generated.'
              );
          });
      }, 150);
      onCleanup(() => {
        active = false;
        clearTimeout(timer);
      });
    });
  }
  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      await this.store.load();
      this.taxSettings.set(await this.tax.settings().catch(() => null));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Document designs could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }
  private render(design: DocumentDesign, preview = false): RenderedDocument {
    const s = this.store.settings()!;
    const tax = this.taxSettings();
    const profile = tax?.active_profile;
    const category = this.sampleTaxCategory();
    const show = design.showVatBreakdown ?? tax?.show_vat_breakdown_on_prints ?? false;
    const sample = sampleDocument(
      this.kind(),
      {
        name: s.name,
        address: s.address,
        email: s.email,
        phone: s.public_whatsapp_number,
        website: s.website_url,
        logoUrl: s.logo_path ? this.store.logoPublicUrl(s.logo_path) : null,
        taxNumber: show && profile?.vat_registered ? profile.tax_registration_number : null,
      },
      {
        registered: category?.rate_bps != null,
        showBreakdown: show,
        rateBps: category?.rate_bps ?? 0,
        classification: category?.classification,
      },
      this.effectivePaper()
    );
    if (
      show &&
      !profile?.vat_registered &&
      category?.rate_bps != null &&
      !['statement', 'purchase-order'].includes(this.kind())
    ) {
      sample.notes =
        'VAT layout example only. VAT calculation is off for this shop.\nEnable VAT in VAT settings to apply it to sales.';
    }
    return renderDocument(sample, design, this.effectivePaper(), {
      preview,
      qrError: preview && !!this.previewError(),
    });
  }
  changed(kind: DocumentKind): boolean {
    const draft = this.drafts()[kind];
    return (
      !!draft &&
      this.comparable(draft) !==
        this.comparable(readDesign(kind, this.store.settings()?.document_designs?.[kind]))
    );
  }
  private comparable(design: DocumentDesign): string {
    return JSON.stringify({
      version: design.version,
      layout: design.layout,
      message: design.message,
      showVatBreakdown: design.showVatBreakdown,
      custom: {
        label: design.custom.label,
        value: design.custom.value,
        display: design.custom.display,
      },
    });
  }
  patch(patch: Partial<DocumentDesign>): void {
    this.drafts.update(d => ({ ...d, [this.kind()]: { ...this.draft(), ...patch } }));
    this.notice.set(null);
  }
  setLayout(layout: DocumentLayout): void {
    this.patch({ layout });
  }
  custom(key: 'label' | 'value' | 'display', value: string): void {
    const custom = { ...this.draft().custom, [key]: value };
    if (key === 'value' || key === 'display') delete custom.qr;
    this.patch({ custom: custom as DocumentDesign['custom'] });
  }
  inheritVat(): void {
    const design = { ...this.draft() };
    delete design.showVatBreakdown;
    this.drafts.update(d => ({ ...d, [this.kind()]: design }));
    this.notice.set(null);
  }
  restore(): void {
    this.drafts.update(d => ({ ...d, [this.kind()]: defaultDesign(this.kind()) }));
    this.notice.set(null);
  }
  discard(): void {
    this.drafts.update(d => {
      const next = { ...d };
      delete next[this.kind()];
      return next;
    });
    this.error.set(null);
    this.notice.set(null);
  }
  private qr(value: string): Promise<PreparedQr> {
    let pending = this.qrCache.get(value);
    if (!pending) {
      pending = prepareDocumentQr(value).catch(error => {
        this.qrCache.delete(value);
        throw error;
      });
      if (this.qrCache.size >= 8) this.qrCache.delete(this.qrCache.keys().next().value!);
      this.qrCache.set(value, pending);
    }
    return pending;
  }
  private async prepare(design: DocumentDesign): Promise<DocumentDesign> {
    if (design.custom.value.trim() && design.custom.display !== 'text')
      design.custom.qr = await this.qr(design.custom.value);
    else delete design.custom.qr;
    return design;
  }
  async save(): Promise<void> {
    if (this.busy()) return;
    const kind = this.kind();
    const draft = structuredClone(this.draft());
    const submitted = this.comparable(draft);
    this.busy.set(true);
    this.error.set(null);
    try {
      const design = await this.prepare(draft);
      await this.store.saveDesign(kind, design);
      this.drafts.update(d =>
        !d[kind] || this.comparable(d[kind]!) === submitted ? { ...d, [kind]: design } : d
      );
      this.notice.set(`${this.labels[kind]} design saved.`);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Save failed. Your draft is still here.');
    } finally {
      this.busy.set(false);
    }
  }
  async testPrint(): Promise<void> {
    if (this.busy() || !this.store.settings()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const document = this.render(await this.prepare(structuredClone(this.draft())));
      await this.print.printDocument(document.title, document.html, document.styles);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Test print failed.');
    } finally {
      this.busy.set(false);
    }
  }
  canDeactivate(): boolean {
    return !this.dirty() || window.confirm('Discard unsaved document designs?');
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  editDetails(): void {
    void this.router.navigate(['/settings'], { queryParams: { tab: 'business' } });
  }
}

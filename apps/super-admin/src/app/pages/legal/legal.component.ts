import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { renderLegalMarkdown } from '@dukarun/legal-markdown';
import {
  LegalDocumentType,
  LegalDocumentVersion,
  PlatformService,
} from '../../core/platform.service';

const TYPES: { value: LegalDocumentType; label: string }[] = [
  { value: 'privacy', label: 'Privacy Notice' },
  { value: 'terms', label: 'Terms of Service' },
  { value: 'dpa', label: 'Data Processing Addendum' },
  { value: 'subprocessors', label: 'Subprocessors' },
];

@Component({
  selector: 'app-legal',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-7xl space-y-5">
      <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="type-caption">Platform publishing</p>
          <h1 class="type-title">Legal documents</h1>
          <p class="mt-1 max-w-2xl text-sm text-base-content/65">
            Paste approved Markdown from Git, compare its hash, preview it, then publish an
            immutable snapshot.
          </p>
        </div>
        <button type="button" class="btn btn-primary" (click)="newDraft()">New draft</button>
      </header>

      @if (error() || notice()) {
        <div class="toast toast-end toast-top z-50 mt-14">
          @if (error()) {
            <div class="alert alert-error" role="alert">{{ error() }}</div>
          } @else if (notice()) {
            <div class="alert alert-success" role="status">{{ notice() }}</div>
          }
        </div>
      }

      <div class="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <section class="card bg-base-100">
          <div class="card-body gap-3 p-4">
            <h2 class="font-semibold">Versions</h2>
            @if (loading()) {
              <span class="loading loading-spinner loading-sm"></span>
            } @else if (documents().length === 0) {
              <p class="text-sm text-base-content/55">No legal documents yet.</p>
            } @else {
              @for (document of documents(); track document.id) {
                <button
                  type="button"
                  class="rounded-field border p-3 text-left transition-colors"
                  [class.border-primary]="selectedId() === document.id"
                  [class.bg-primary/5]="selectedId() === document.id"
                  [class.border-base-300]="selectedId() !== document.id"
                  (click)="select(document)"
                >
                  <span class="block text-sm font-medium">{{ label(document.document_type) }}</span>
                  <span
                    class="mt-1 flex items-center justify-between gap-2 text-xs text-base-content/55"
                  >
                    <span>{{ document.version }}</span>
                    <span
                      class="badge badge-sm"
                      [class.badge-success]="document.publication_state === 'published'"
                    >
                      {{ document.publication_state }}
                    </span>
                  </span>
                </button>
              }
            }
          </div>
        </section>

        <section class="card min-w-0 bg-base-100">
          <div class="card-body gap-5 p-4 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="font-semibold">{{ selectedId() ? 'Document version' : 'New draft' }}</h2>
              <div class="join">
                <button
                  type="button"
                  class="btn btn-sm join-item"
                  [class.btn-active]="!preview()"
                  (click)="preview.set(false)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="btn btn-sm join-item"
                  [class.btn-active]="preview()"
                  (click)="preview.set(true)"
                >
                  Preview
                </button>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="form-control">
                <span class="label-text mb-1">Document type</span>
                <select class="select select-bordered" [formControl]="type">
                  @for (option of types; track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </label>
              <label class="form-control">
                <span class="label-text mb-1">Version</span>
                <input
                  class="input input-bordered"
                  placeholder="2026-09-01"
                  [formControl]="version"
                  [readOnly]="readOnly()"
                />
              </label>
              <label class="form-control">
                <span class="label-text mb-1">Effective date</span>
                <input
                  type="date"
                  class="input input-bordered"
                  [formControl]="effectiveDate"
                  [readOnly]="readOnly()"
                />
              </label>
              <label class="form-control">
                <span class="label-text mb-1">Enforcement date</span>
                <input
                  type="date"
                  class="input input-bordered"
                  [formControl]="enforcementDate"
                  [readOnly]="readOnly()"
                />
              </label>
            </div>

            <label class="flex items-start gap-3 rounded-field border border-base-300 p-3">
              <input
                type="checkbox"
                class="checkbox checkbox-primary"
                [formControl]="requiresAcceptance"
              />
              <span class="text-sm">
                Require company acceptance. Use this only for material Terms changes and allow at
                least 14 days between publication and enforcement.
              </span>
            </label>

            @if (preview()) {
              <article
                class="legal-preview rounded-box border border-base-300 p-5 sm:p-8"
                [innerHTML]="previewHtml()"
              ></article>
            } @else {
              <label class="form-control">
                <span class="label-text mb-1">Markdown</span>
                <textarea
                  class="textarea textarea-bordered min-h-[30rem] w-full font-mono text-sm leading-6"
                  spellcheck="true"
                  [formControl]="markdown"
                  [readOnly]="readOnly()"
                  (input)="calculateHash()"
                ></textarea>
              </label>
            }

            <div class="grid gap-4 rounded-box bg-base-200/60 p-4 lg:grid-cols-2">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-base-content/50">
                  Pasted content hash
                </p>
                <p class="mt-1 break-all font-mono text-xs">
                  {{ calculatedHash() || 'Paste Markdown to calculate' }}
                </p>
              </div>
              <label class="form-control">
                <span class="label-text mb-1">Expected Git hash</span>
                <input
                  class="input input-bordered font-mono text-xs"
                  [formControl]="expectedHash"
                  placeholder="SHA-256 from the repository check"
                />
                @if (expectedHash.value && calculatedHash()) {
                  <span
                    class="label-text-alt mt-1"
                    [class.text-success]="hashMatches()"
                    [class.text-error]="!hashMatches()"
                  >
                    {{ hashMatches() ? 'Hashes match' : 'Hashes do not match' }}
                  </span>
                }
              </label>
            </div>

            @if (!readOnly()) {
              <div
                class="flex flex-col gap-3 border-t border-base-300 pt-5 sm:flex-row sm:items-center"
              >
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="saving()"
                  (click)="saveDraft()"
                >
                  {{ saving() ? 'Saving…' : 'Save draft' }}
                </button>
                @if (selectedId()) {
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [formControl]="confirmPublish"
                    />
                    I confirm this version is approved for publication.
                  </label>
                  <button
                    type="button"
                    class="btn btn-success sm:ml-auto"
                    [disabled]="!canPublish() || publishing()"
                    (click)="publishDocument()"
                  >
                    {{ publishing() ? 'Publishing…' : 'Publish' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost text-error"
                    [disabled]="saving()"
                    (click)="discardDraft()"
                  >
                    Discard
                  </button>
                }
              </div>
            } @else {
              <p class="text-sm text-base-content/60">
                Published and superseded versions are immutable.
              </p>
            }
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `
    :host ::ng-deep .legal-preview h1 {
      font-size: 1.875rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
    }
    :host ::ng-deep .legal-preview h2 {
      font-size: 1.25rem;
      font-weight: 650;
      margin: 2rem 0 0.75rem;
      scroll-margin-top: 6rem;
    }
    :host ::ng-deep .legal-preview h3 {
      font-size: 1rem;
      font-weight: 650;
      margin: 1.5rem 0 0.5rem;
    }
    :host ::ng-deep .legal-preview p {
      margin-top: 0.75rem;
      line-height: 1.75;
    }
    :host ::ng-deep .legal-preview ul,
    :host ::ng-deep .legal-preview ol {
      margin: 0.75rem 0 0 1.25rem;
    }
    :host ::ng-deep .legal-preview ul {
      list-style: disc;
    }
    :host ::ng-deep .legal-preview ol {
      list-style: decimal;
    }
    :host ::ng-deep .legal-preview li {
      margin-top: 0.35rem;
    }
    :host ::ng-deep .legal-preview a {
      text-decoration: underline;
      color: oklch(var(--p));
    }
  `,
})
export class LegalComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly types = TYPES;
  protected readonly documents = signal<LegalDocumentVersion[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selectedState = signal<LegalDocumentVersion['publication_state']>('draft');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly preview = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly calculatedHash = signal('');
  protected readonly previewHtml = signal('');

  protected readonly type = new FormControl<LegalDocumentType>('privacy', { nonNullable: true });
  protected readonly version = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)],
  });
  protected readonly effectiveDate = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly enforcementDate = new FormControl('', { nonNullable: true });
  protected readonly requiresAcceptance = new FormControl(false, { nonNullable: true });
  protected readonly markdown = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(40)],
  });
  protected readonly expectedHash = new FormControl('', { nonNullable: true });
  protected readonly confirmPublish = new FormControl(false, { nonNullable: true });

  ngOnInit(): void {
    void this.load();
  }

  protected readOnly(): boolean {
    return this.selectedState() !== 'draft';
  }
  protected hashMatches(): boolean {
    return this.expectedHash.value.trim().toLowerCase() === this.calculatedHash();
  }
  protected canPublish(): boolean {
    return (
      !!this.selectedId() && this.confirmPublish.value && this.hashMatches() && !this.readOnly()
    );
  }
  protected label(type: LegalDocumentType): string {
    return TYPES.find(item => item.value === type)?.label ?? type;
  }

  protected newDraft(): void {
    const today = this.nairobiDate(new Date().toISOString());
    this.setDocumentControlsDisabled(false);
    this.selectedId.set(null);
    this.selectedState.set('draft');
    this.type.setValue('privacy');
    this.version.setValue(today);
    this.effectiveDate.setValue(today);
    this.enforcementDate.setValue('');
    this.requiresAcceptance.setValue(false);
    this.markdown.setValue('');
    this.expectedHash.setValue('');
    this.confirmPublish.setValue(false);
    this.calculatedHash.set('');
    this.previewHtml.set('');
    this.preview.set(false);
    this.error.set(null);
    this.notice.set(null);
  }

  protected select(document: LegalDocumentVersion): void {
    this.setDocumentControlsDisabled(false);
    this.selectedId.set(document.id);
    this.selectedState.set(document.publication_state);
    this.type.setValue(document.document_type);
    this.version.setValue(document.version);
    this.effectiveDate.setValue(this.nairobiDate(document.effective_at));
    this.enforcementDate.setValue(this.nairobiDate(document.enforcement_at));
    this.requiresAcceptance.setValue(document.requires_company_acceptance);
    this.markdown.setValue(document.content_markdown ?? '');
    this.expectedHash.setValue(
      document.publication_state === 'draft' ? '' : document.content_sha256
    );
    this.confirmPublish.setValue(false);
    this.error.set(null);
    this.notice.set(null);
    this.setDocumentControlsDisabled(document.publication_state !== 'draft');
    void this.calculateHash();
  }

  protected async calculateHash(): Promise<void> {
    const source = this.markdown.value.replace(/\r\n?/g, '\n');
    this.previewHtml.set(renderLegalMarkdown(source).html);
    if (!source) {
      this.calculatedHash.set('');
      return;
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    if (source !== this.markdown.value.replace(/\r\n?/g, '\n')) return;
    this.calculatedHash.set(
      Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    );
  }

  protected async saveDraft(): Promise<boolean> {
    const validationError = this.draftValidationError();
    if (validationError) {
      this.version.markAsTouched();
      this.effectiveDate.markAsTouched();
      this.markdown.markAsTouched();
      this.error.set(validationError);
      this.notice.set(null);
      return false;
    }
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const id = await this.platform.saveLegalDraft({
        id: this.selectedId(),
        type: this.type.value,
        version: this.version.value,
        markdown: this.markdown.value,
        effectiveAt: `${this.effectiveDate.value}T00:00:00+03:00`,
        enforcementAt: this.enforcementDate.value
          ? `${this.enforcementDate.value}T00:00:00+03:00`
          : null,
        requiresAcceptance: this.requiresAcceptance.value,
      });
      const expectedHash = this.expectedHash.value;
      this.selectedId.set(id);
      await this.load(id);
      this.expectedHash.setValue(expectedHash);
      this.notice.set('Draft saved.');
      return true;
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Draft could not be saved.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected async publishDocument(): Promise<void> {
    if (!this.selectedId() || !this.canPublish()) return;
    const saved = await this.saveDraft();
    const id = this.selectedId();
    if (!saved || !id) return;
    this.publishing.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.platform.publishLegalDocument(id, this.expectedHash.value.trim());
      await this.load(id);
      this.notice.set('Document published.');
    } catch (error) {
      const message = this.errorMessage(error, 'Document could not be published.');
      this.error.set(
        message.includes('effective_date_in_future')
          ? 'The effective date must be today or earlier.'
          : message
      );
    } finally {
      this.publishing.set(false);
    }
  }

  protected async discardDraft(): Promise<void> {
    const id = this.selectedId();
    if (!id || this.readOnly() || !window.confirm('Discard this draft permanently?')) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.platform.discardLegalDraft(id);
      this.newDraft();
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Draft could not be discarded.');
    } finally {
      this.saving.set(false);
    }
  }

  private async load(selectId?: string): Promise<void> {
    this.loading.set(true);
    try {
      const documents = await this.platform.legalDocuments();
      this.documents.set(documents);
      const selected = documents.find(item => item.id === (selectId ?? this.selectedId()));
      if (selected) this.select(selected);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Documents could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  private setDocumentControlsDisabled(disabled: boolean): void {
    const options = { emitEvent: false };
    if (disabled) {
      this.type.disable(options);
      this.version.disable(options);
      this.effectiveDate.disable(options);
      this.enforcementDate.disable(options);
      this.requiresAcceptance.disable(options);
      this.markdown.disable(options);
    } else {
      this.type.enable(options);
      this.version.enable(options);
      this.effectiveDate.enable(options);
      this.enforcementDate.enable(options);
      this.requiresAcceptance.enable(options);
      this.markdown.enable(options);
    }
  }

  private nairobiDate(value: string | null): string {
    if (!value) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(item => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private draftValidationError(): string | null {
    if (this.readOnly()) return 'Published documents cannot be edited.';
    if (this.version.hasError('required')) return 'Enter a version date.';
    if (this.version.hasError('pattern')) return 'Use YYYY-MM-DD for the version.';
    if (this.effectiveDate.invalid) return 'Choose an effective date.';
    if (this.markdown.hasError('required')) return 'Paste the Markdown document before saving.';
    if (this.markdown.hasError('minlength')) return 'The Markdown document is too short.';
    return null;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
    return fallback;
  }
}

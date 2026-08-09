import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { renderLegalMarkdown } from '@dukarun/legal-markdown';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LegalDocumentHistoryItem,
  LegalDocumentType,
  LegalService,
  PublishedLegalDocument,
} from './legal.service';
import { environment } from '../../environments/environment';

const LABELS: Record<LegalDocumentType, string> = {
  privacy: 'Privacy Notice',
  terms: 'Terms of Service',
  dpa: 'Data Processing Addendum',
  subprocessors: 'Subprocessors',
};

@Component({
  selector: 'app-legal-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="legal-page bg-base-100">
      @if (loading()) {
        <div class="mkt-container flex min-h-[60vh] items-center justify-center py-16">
          <span
            class="loading loading-spinner loading-lg"
            aria-label="Loading legal document"
          ></span>
        </div>
      } @else if (document(); as current) {
        <header class="bg-base-200/60 py-12 sm:py-16">
          <div class="mkt-container max-w-4xl text-center">
            <span class="mkt-eyebrow">Legal</span>
            <h1 class="mkt-h1 mt-3">{{ rendered().title }}</h1>
            <p class="mt-4 text-sm text-base-content/60">
              Version {{ current.version }}, effective {{ date(current.effective_at) }}
            </p>
          </div>
        </header>

        <div
          class="mkt-container grid max-w-6xl gap-8 py-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-14"
        >
          <aside>
            <nav
              class="sticky top-24 rounded-box border border-base-300/60 bg-base-200/40 p-5"
              aria-label="Contents"
            >
              <h2 class="text-xs font-semibold uppercase tracking-wider text-base-content/60">
                Contents
              </h2>
              <ul class="mt-3 space-y-2">
                @for (section of rendered().sections; track section.id) {
                  <li>
                    <a
                      class="link link-primary text-sm"
                      [routerLink]="[]"
                      [fragment]="section.id"
                      >{{ section.title }}</a
                    >
                  </li>
                }
              </ul>
            </nav>
          </aside>

          <div class="min-w-0">
            <div class="legal-markdown" [innerHTML]="rendered().html"></div>
            <section
              class="mt-10 border-t border-base-300 pt-6 text-sm text-base-content/65"
              aria-labelledby="version-history"
            >
              <h2 id="version-history" class="font-semibold text-base-content">Version history</h2>
              <ul class="mt-2 space-y-1">
                @for (item of history(); track item.version) {
                  <li>
                    <a
                      class="link link-primary"
                      [routerLink]="[]"
                      [queryParams]="{ version: item.version }"
                      >{{ item.version }}</a
                    >
                    <span> ({{ item.publication_state }})</span>
                  </li>
                }
              </ul>
              <p class="mt-4">
                Questions:
                <a class="link link-primary" href="mailto:hello@dukarun.com">hello@dukarun.com</a>
              </p>
            </section>
          </div>
        </div>
      } @else {
        <div
          class="mkt-container flex min-h-[60vh] max-w-2xl flex-col items-center justify-center py-16 text-center"
        >
          <span class="mkt-eyebrow">Legal</span>
          <h1 class="mkt-h1 mt-3">{{ label }}</h1>
          <p class="mkt-lead mt-4">{{ error() || 'This document is not published yet.' }}</p>
          <div class="mt-6 flex gap-2">
            <button type="button" class="btn btn-primary" (click)="load()">Try again</button>
            <a routerLink="/contact" class="btn btn-ghost">Contact Dukarun</a>
          </div>
        </div>
      }
    </article>
  `,
  styles: `
    :host ::ng-deep .legal-markdown h1 {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 1.5rem;
    }
    :host ::ng-deep .legal-markdown h2 {
      font-size: 1.35rem;
      font-weight: 650;
      margin: 2.25rem 0 0.75rem;
      scroll-margin-top: 6.5rem;
    }
    :host ::ng-deep .legal-markdown h3 {
      font-size: 1.05rem;
      font-weight: 650;
      margin: 1.5rem 0 0.5rem;
      scroll-margin-top: 6.5rem;
    }
    :host ::ng-deep .legal-markdown p {
      margin-top: 0.8rem;
      line-height: 1.8;
      color: color-mix(in oklab, currentColor 76%, transparent);
    }
    :host ::ng-deep .legal-markdown ul,
    :host ::ng-deep .legal-markdown ol {
      margin: 0.8rem 0 0 1.35rem;
      line-height: 1.7;
    }
    :host ::ng-deep .legal-markdown ul {
      list-style: disc;
    }
    :host ::ng-deep .legal-markdown ol {
      list-style: decimal;
    }
    :host ::ng-deep .legal-markdown li {
      margin-top: 0.4rem;
    }
    :host ::ng-deep .legal-markdown a {
      color: oklch(var(--p));
      text-decoration: underline;
    }
    @media print {
      :host {
        color: #000;
      }
      .legal-page header {
        padding-block: 1rem;
      }
      aside,
      #version-history + ul {
        display: none;
      }
    }
  `,
})
export class LegalPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly legal = inject(LegalService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly type = this.route.snapshot.data['documentType'] as LegalDocumentType;
  protected readonly label = LABELS[this.type];
  private readonly initialDocument = this.legal.transferredDocument(this.type);
  protected readonly document = signal<PublishedLegalDocument | null>(this.initialDocument ?? null);
  protected readonly history = signal<LegalDocumentHistoryItem[]>(
    this.legal.transferredHistory(this.type) ?? []
  );
  protected readonly rendered = signal(
    renderLegalMarkdown(this.initialDocument?.content_markdown ?? `# ${this.label}`, {
      includeTitle: false,
    })
  );
  protected readonly loading = signal(this.initialDocument === undefined);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.load());
  }

  protected async load(): Promise<void> {
    if (!this.document()) this.loading.set(true);
    this.error.set(null);
    try {
      const version = this.route.snapshot.queryParamMap.get('version');
      const refresh = isPlatformBrowser(this.platformId) && this.initialDocument !== undefined;
      const document = await this.legal.publishedDocument(this.type, version, refresh);
      if (!document && isPlatformServer(this.platformId) && environment.publicDataMode === 'live') {
        throw new Error(`Published ${this.type} document is required for prerendering.`);
      }
      const history = await this.legal.documentHistory(this.type, refresh).catch(() => []);
      this.document.set(document);
      this.history.set(history);
      if (document) {
        const rendered = renderLegalMarkdown(document.content_markdown, { includeTitle: false });
        this.rendered.set(rendered);
        this.title.setTitle(`${rendered.title} | Dukarun`);
        this.meta.updateTag({ name: 'description', content: `Current ${this.label} for Dukarun.` });
      } else {
        this.title.setTitle(`${this.label} | Dukarun`);
      }
    } catch (error) {
      if (isPlatformServer(this.platformId) && environment.publicDataMode === 'live') throw error;
      if (
        isPlatformBrowser(this.platformId) &&
        this.initialDocument &&
        !this.route.snapshot.queryParamMap.get('version')
      ) {
        return;
      }
      this.document.set(null);
      this.error.set('The document could not be loaded. Check your connection and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  protected date(value: string): string {
    return new Date(value).toLocaleDateString('en-KE', {
      dateStyle: 'long',
      timeZone: 'Africa/Nairobi',
    });
  }
}

import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { renderSafeMarkdown } from '@dukarun/legal-markdown';
import { environment } from '../../environments/environment';
import { appUrl } from '../core/public-url';
import { SiteSeoService } from '../core/site-seo.service';
import { IconComponent } from '../shared/ui/icon.component';
import { BlogService, PublishedBlogPost } from './blog.service';

const ACQUISITION_CTA_LABELS = new Set([
  'Check today’s closing',
  'See how Dukarun tracks stock',
  'Talk through your shop setup',
]);

@Component({
  selector: 'app-blog-article',
  imports: [RouterLink, DatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (post(); as article) {
      <div
        class="fixed left-0 top-16 z-30 h-0.5 bg-primary transition-[width] duration-150"
        [style.width.%]="readingProgress()"
        aria-hidden="true"
      ></div>
      <article>
        <header class="article-masthead border-b border-base-300/60">
          <div class="mkt-container max-w-5xl py-12 sm:py-20">
            <a
              routerLink="/blog"
              class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-base-content/55 transition-colors hover:text-primary"
            >
              <span aria-hidden="true">←</span>
              Guides
            </a>
            <div
              class="mt-7 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.13em]"
            >
              <span class="text-primary">{{ article.tags[0] || 'Shop guide' }}</span>
              <span class="h-1 w-1 rounded-full bg-base-content/20"></span>
              <span class="text-base-content/45">{{ article.reading_minutes }} minute read</span>
            </div>
            <h1
              class="mt-5 max-w-4xl text-4xl font-bold leading-[1.04] tracking-[-0.035em] sm:text-6xl"
            >
              {{ article.title }}
            </h1>
            <p class="mt-6 max-w-3xl text-lg leading-relaxed text-base-content/65 sm:text-xl">
              {{ article.excerpt }}
            </p>
            <div class="mt-8 flex items-center gap-3">
              <span
                class="flex size-10 items-center justify-center rounded-full bg-neutral text-sm font-bold text-neutral-content"
                aria-hidden="true"
                >D</span
              >
              <p class="text-sm leading-snug">
                <strong class="block font-semibold">{{ article.author_name }}</strong>
                <span class="text-base-content/45"
                  >Published {{ article.published_at | date: 'd MMMM y' }}</span
                >
              </p>
            </div>
          </div>
        </header>

        @if (coverUrl(); as image) {
          <div class="mkt-container max-w-6xl pt-8 sm:pt-12">
            <img
              [src]="image"
              [alt]="article.cover_image_alt || ''"
              class="aspect-[16/8.5] w-full rounded-[1.25rem] object-cover shadow-sm"
            />
          </div>
        }

        <div
          class="mkt-container grid max-w-5xl items-start gap-8 py-10 sm:py-16 lg:grid-cols-[9rem_minmax(0,43rem)] lg:justify-center lg:gap-14"
        >
          <aside class="border-y border-base-300/60 py-4 lg:sticky lg:top-28 lg:border-y-0 lg:py-0">
            <div class="flex items-center justify-between gap-4 lg:block">
              <div class="text-xs text-base-content/45">
                <span class="block font-semibold uppercase tracking-wider text-base-content/65"
                  >Reading</span
                >
                <span class="mt-1 block">{{ article.reading_minutes }} minutes</span>
              </div>
              <button
                type="button"
                class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-base-content/60 transition-colors hover:text-primary lg:mt-5"
                (click)="shareArticle()"
              >
                <app-icon name="heroShare" size="sm" />
                {{ shareNotice() || 'Share' }}
              </button>
            </div>
          </aside>

          <div class="min-w-0">
            <div class="blog-prose" [innerHTML]="html()" (click)="trackContentLink($event)"></div>

            <aside
              class="article-cta relative mt-14 overflow-hidden rounded-[1.25rem] bg-neutral p-7 text-neutral-content sm:p-10"
            >
              <div class="relative z-10 max-w-xl">
                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  From insight to action
                </p>
                <h2 class="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  Run the business with the same clarity.
                </h2>
                <p class="mt-4 max-w-lg leading-relaxed text-neutral-content/65">
                  Sell, manage stock, follow cash, and keep balanced books from one practical
                  workspace.
                </p>
                <a
                  [href]="registrationUrl()"
                  class="btn btn-primary mt-7 min-h-12 px-6"
                  (click)="trackCta($event)"
                >
                  Get started with Dukarun
                  <app-icon name="heroArrowRight" size="sm" />
                </a>
              </div>
            </aside>

            <footer
              class="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-base-300/70 pt-7"
            >
              <a
                routerLink="/blog"
                class="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
              >
                <span aria-hidden="true">←</span>
                More guides
              </a>
              <button
                type="button"
                class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-base-content/55 hover:text-primary"
                (click)="shareArticle()"
              >
                <app-icon name="heroShare" size="sm" />
                Share article
              </button>
            </footer>
          </div>
        </div>
      </article>
    } @else if (notFound()) {
      <section class="mkt-container py-24 text-center">
        <h1 class="mkt-display">Article not found</h1>
        <p class="mt-3 text-base-content/65">It may have moved or is no longer published.</p>
        <a routerLink="/blog" class="btn btn-primary mt-6">Browse guides</a>
      </section>
    } @else {
      <div class="mkt-container max-w-4xl py-16"><div class="skeleton h-96 rounded-box"></div></div>
    }
  `,
  styles: `
    .article-masthead {
      background:
        radial-gradient(
          circle at 85% 12%,
          color-mix(in oklab, var(--color-primary) 12%, transparent),
          transparent 26rem
        ),
        linear-gradient(
          180deg,
          var(--color-base-100),
          color-mix(in oklab, var(--color-base-200) 42%, var(--color-base-100))
        );
    }
    .article-cta::after {
      position: absolute;
      right: -4rem;
      bottom: -5rem;
      width: 15rem;
      height: 15rem;
      border-radius: 999px;
      background: color-mix(in oklab, var(--color-primary) 28%, transparent);
      content: '';
      filter: blur(1px);
    }
    :host ::ng-deep .blog-prose {
      font-size: 1.075rem;
      line-height: 1.85;
      color: color-mix(in oklab, currentColor 84%, transparent);
    }
    :host ::ng-deep .blog-prose > h1:first-child {
      display: none;
    }
    :host ::ng-deep .blog-prose h1,
    :host ::ng-deep .blog-prose h2,
    :host ::ng-deep .blog-prose h3 {
      margin: 3rem 0 1rem;
      color: var(--color-base-content);
      font-weight: 750;
      line-height: 1.25;
    }
    :host ::ng-deep .blog-prose h1 {
      font-size: 2.25rem;
    }
    :host ::ng-deep .blog-prose h2 {
      font-size: 1.5rem;
    }
    :host ::ng-deep .blog-prose h3 {
      font-size: 1.2rem;
    }
    :host ::ng-deep .blog-prose p {
      margin: 0 0 1.4rem;
    }
    :host ::ng-deep .blog-prose > p:first-of-type {
      font-size: 1.2rem;
      line-height: 1.75;
      color: var(--color-base-content);
    }
    :host ::ng-deep .blog-prose ul,
    :host ::ng-deep .blog-prose ol {
      margin: 0 0 1.25rem 1.5rem;
    }
    :host ::ng-deep .blog-prose ul {
      list-style: disc;
    }
    :host ::ng-deep .blog-prose ol {
      list-style: decimal;
    }
    :host ::ng-deep .blog-prose blockquote {
      margin: 2rem 0;
      border-left: 3px solid var(--color-primary);
      padding: 0.25rem 0 0.25rem 1.25rem;
      color: color-mix(in oklab, var(--color-base-content) 72%, transparent);
      font-size: 1.15rem;
    }
    :host ::ng-deep .blog-prose a {
      color: var(--color-primary);
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }
    :host ::ng-deep .blog-prose hr {
      margin: 3rem 0;
      border-color: color-mix(in oklab, var(--color-base-300) 70%, transparent);
    }
    :host ::ng-deep .blog-prose pre {
      margin: 2rem 0;
      overflow-x: auto;
      border-radius: 0.75rem;
      background: var(--color-neutral);
      padding: 1.25rem;
      color: var(--color-neutral-content);
      font-size: 0.9rem;
      line-height: 1.65;
    }
    :host ::ng-deep .blog-prose img {
      width: 100%;
      border-radius: 0.9rem;
      border: 1px solid color-mix(in oklab, var(--color-base-300) 70%, transparent);
      box-shadow: var(--shadow-card);
    }
    :host ::ng-deep .blog-prose figure {
      margin: 2.5rem 0;
    }
    :host ::ng-deep .blog-prose table {
      display: block;
      margin: 2rem 0;
      max-width: 100%;
      overflow-x: auto;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    :host ::ng-deep .blog-prose th,
    :host ::ng-deep .blog-prose td {
      border-bottom: 1px solid var(--color-base-300);
      padding: 0.65rem 0.9rem;
      text-align: left;
      white-space: nowrap;
    }
    :host ::ng-deep .blog-prose :not(pre) > code {
      border-radius: 0.3rem;
      background: var(--color-base-200);
      padding: 0.12em 0.35em;
      font-size: 0.9em;
    }
    @media (min-width: 40rem) {
      :host ::ng-deep .blog-prose {
        font-size: 1.125rem;
      }
    }
  `,
})
export class BlogArticleComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly blog = inject(BlogService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo = inject(SiteSeoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  private readonly ctaEventId = this.blog.newEventId();
  private engagementTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollFrame: number | null = null;
  private sent50 = false;
  private sent90 = false;

  protected readonly post = signal<PublishedBlogPost | null>(null);
  protected readonly html = signal<SafeHtml>('');
  protected readonly coverUrl = signal<string | null>(null);
  protected readonly notFound = signal(false);
  protected readonly readingProgress = signal(0);
  protected readonly shareNotice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const article = await this.blog.post(this.slug).catch(() => null);
    if (!article) {
      this.notFound.set(true);
      this.seo.applyNotFound();
      return;
    }
    this.apply(article);
    if (isPlatformBrowser(this.platformId)) {
      void this.blog
        .recordEvent(article.post_id, 'post_view', this.sourceMetadata())
        .catch(() => undefined);
      this.engagementTimer = setTimeout(
        () => void this.blog.recordEvent(article.post_id, 'engaged_10s').catch(() => undefined),
        10_000
      );
      window.addEventListener('scroll', this.onScroll, { passive: true });
      this.destroyRef.onDestroy(() => {
        if (this.engagementTimer) clearTimeout(this.engagementTimer);
        if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
        window.removeEventListener('scroll', this.onScroll);
      });
    }
  }

  protected registrationUrl(): string {
    return appUrl('/register', { blog_ref: this.ctaEventId });
  }

  protected async trackCta(event: MouseEvent): Promise<void> {
    const article = this.post();
    if (!article) return;
    event.preventDefault();
    // Give the durable attribution event a short opportunity to finish before
    // crossing origins. Registration still proceeds if analytics is unavailable.
    await Promise.race([
      this.blog.recordEvent(
        article.post_id,
        'cta_click',
        this.sourceMetadata(),
        this.ctaEventId,
        true
      ),
      new Promise(resolve => setTimeout(resolve, 1_200)),
    ]).catch(() => undefined);
    window.location.assign(this.registrationUrl());
  }

  protected trackContentLink(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a');
    const article = this.post();
    const label = anchor?.textContent?.trim() ?? '';
    if (!anchor || !article || !ACQUISITION_CTA_LABELS.has(label)) return;
    const url = new URL(anchor.href, environment.sitePublicUrl);
    void this.blog
      .recordEvent(
        article.post_id,
        'cta_click',
        {
          ...this.sourceMetadata(),
          source: 'article_body',
          label,
          destination: `${url.origin}${url.pathname}${url.hash}`,
        },
        this.blog.newEventId(),
        true
      )
      .catch(() => undefined);
  }

  protected async shareArticle(): Promise<void> {
    const article = this.post();
    if (!article || !isPlatformBrowser(this.platformId)) return;
    const url = new URL(`/blog/${article.slug}`, environment.sitePublicUrl).toString();
    try {
      if (navigator.share) {
        // URL-only lets WhatsApp build the preview from the canonical Open Graph response.
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        this.shareNotice.set('Link copied');
        setTimeout(() => this.shareNotice.set(null), 2_000);
      }
      await this.blog.recordEvent(article.post_id, 'share_click').catch(() => undefined);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.shareNotice.set('Could not share');
      setTimeout(() => this.shareNotice.set(null), 2_000);
    }
  }

  private apply(article: PublishedBlogPost): void {
    this.post.set(article);
    this.html.set(
      this.sanitizer.bypassSecurityTrustHtml(renderSafeMarkdown(article.content_markdown).html)
    );
    this.coverUrl.set(this.blog.coverUrl(article.cover_image_path));
    this.seo.applyBlogPost(article, this.coverUrl());
  }

  private readonly onScroll = (): void => {
    if (this.scrollFrame !== null) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null;
      this.updateScrollProgress();
    });
  };

  private updateScrollProgress(): void {
    const article = this.post();
    if (!article) return;
    const available = document.documentElement.scrollHeight - window.innerHeight;
    if (available <= 0) return;
    const progress = window.scrollY / available;
    this.readingProgress.set(Math.min(100, Math.max(0, progress * 100)));
    if (progress >= 0.5 && !this.sent50) {
      this.sent50 = true;
      void this.blog.recordEvent(article.post_id, 'scroll_50').catch(() => undefined);
    }
    if (progress >= 0.9 && !this.sent90) {
      this.sent90 = true;
      void this.blog.recordEvent(article.post_id, 'scroll_90').catch(() => undefined);
    }
  }

  private sourceMetadata(): Record<string, string> {
    const referrer = document.referrer ? new URL(document.referrer).hostname : '';
    const params = new URLSearchParams(location.search);
    return Object.fromEntries(
      [
        ['referrer', referrer],
        ['utm_source', params.get('utm_source') ?? ''],
        ['utm_medium', params.get('utm_medium') ?? ''],
        ['utm_campaign', params.get('utm_campaign') ?? ''],
      ].filter(([, value]) => value)
    );
  }
}

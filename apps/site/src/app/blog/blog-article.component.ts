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
import { appUrl } from '../core/public-url';
import { SiteSeoService } from '../core/site-seo.service';
import { BlogService, PublishedBlogPost } from './blog.service';

@Component({
  selector: 'app-blog-article',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (post(); as article) {
      <article>
        <header class="border-b border-base-300/60 bg-base-200/35">
          <div class="mkt-container max-w-4xl py-12 sm:py-16">
            <a routerLink="/blog" class="text-sm font-medium text-primary">← All articles</a>
            <div class="mt-5 flex flex-wrap gap-2">
              @for (tag of article.tags; track tag) {
                <span class="badge badge-ghost">{{ tag }}</span>
              }
            </div>
            <h1 class="mkt-display mt-4">{{ article.title }}</h1>
            <p class="mt-4 text-lg text-base-content/70">{{ article.excerpt }}</p>
            <p class="mt-5 text-sm text-base-content/55">
              {{ article.author_name }} · {{ article.published_at | date: 'd MMMM y' }} ·
              {{ article.reading_minutes }} min read
            </p>
          </div>
        </header>

        <div class="mkt-container max-w-4xl py-10 sm:py-14">
          @if (coverUrl(); as image) {
            <img
              [src]="image"
              [alt]="article.cover_image_alt || ''"
              class="mb-10 aspect-[16/9] w-full rounded-box object-cover"
            />
          }
          <div class="blog-prose" [innerHTML]="html()"></div>
          <aside class="mt-12 rounded-box bg-primary p-6 text-primary-content sm:p-8">
            <h2 class="text-2xl font-bold">Put the idea into practice with Dukarun.</h2>
            <p class="mt-2 max-w-2xl text-primary-content/80">
              Sell, manage stock, and keep balanced books from one practical workspace.
            </p>
            <a
              [href]="registrationUrl()"
              class="btn mt-5 border-0 bg-white text-primary hover:bg-white/90"
              (click)="trackCta($event)"
              >Start your free trial</a
            >
          </aside>
        </div>
      </article>
    } @else if (notFound()) {
      <section class="mkt-container py-24 text-center">
        <h1 class="mkt-display">Article not found</h1>
        <p class="mt-3 text-base-content/65">It may have moved or is no longer published.</p>
        <a routerLink="/blog" class="btn btn-primary mt-6">Browse articles</a>
      </section>
    } @else {
      <div class="mkt-container max-w-4xl py-16"><div class="skeleton h-96 rounded-box"></div></div>
    }
  `,
  styles: `
    :host ::ng-deep .blog-prose {
      font-size: 1.05rem;
      line-height: 1.8;
      color: color-mix(in oklab, currentColor 84%, transparent);
    }
    :host ::ng-deep .blog-prose h1,
    :host ::ng-deep .blog-prose h2,
    :host ::ng-deep .blog-prose h3 {
      margin: 2rem 0 0.75rem;
      color: var(--color-base-content);
      font-weight: 750;
      line-height: 1.25;
    }
    :host ::ng-deep .blog-prose h1 {
      font-size: 2rem;
    }
    :host ::ng-deep .blog-prose h2 {
      font-size: 1.5rem;
    }
    :host ::ng-deep .blog-prose h3 {
      font-size: 1.2rem;
    }
    :host ::ng-deep .blog-prose p {
      margin: 0 0 1.25rem;
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
      margin: 1.5rem 0;
      border-left: 4px solid var(--color-primary);
      padding-left: 1rem;
      font-style: italic;
    }
    :host ::ng-deep .blog-prose a {
      color: var(--color-primary);
      text-decoration: underline;
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
  private sent50 = false;
  private sent90 = false;

  protected readonly post = signal<PublishedBlogPost | null>(null);
  protected readonly html = signal<SafeHtml>('');
  protected readonly coverUrl = signal<string | null>(null);
  protected readonly notFound = signal(false);

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
        window.removeEventListener('scroll', this.onScroll);
      });
      void this.blog
        .post(this.slug, true)
        .then(fresh => {
          if (!fresh) {
            this.post.set(null);
            this.notFound.set(true);
            this.seo.applyNotFound();
          } else if (fresh.revision_id !== article.revision_id) {
            this.apply(fresh);
          }
        })
        .catch(() => undefined);
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

  private apply(article: PublishedBlogPost): void {
    this.post.set(article);
    this.html.set(
      this.sanitizer.bypassSecurityTrustHtml(renderSafeMarkdown(article.content_markdown).html)
    );
    this.coverUrl.set(this.blog.coverUrl(article.cover_image_path));
    this.seo.applyBlogPost(article, this.coverUrl());
  }

  private readonly onScroll = (): void => {
    const article = this.post();
    if (!article) return;
    const available = document.documentElement.scrollHeight - window.innerHeight;
    if (available <= 0) return;
    const progress = window.scrollY / available;
    if (progress >= 0.5 && !this.sent50) {
      this.sent50 = true;
      void this.blog.recordEvent(article.post_id, 'scroll_50').catch(() => undefined);
    }
    if (progress >= 0.9 && !this.sent90) {
      this.sent90 = true;
      void this.blog.recordEvent(article.post_id, 'scroll_90').catch(() => undefined);
    }
  };

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

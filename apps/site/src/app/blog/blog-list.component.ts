import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BlogPostSummary, BlogService } from './blog.service';

@Component({
  selector: 'app-blog-list',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="border-b border-base-300/60 bg-base-200/40">
      <div class="mkt-container py-14 sm:py-20">
        <p class="mkt-eyebrow">Dukarun journal</p>
        <h1 class="mkt-display mt-3 max-w-3xl">Practical ideas for running a stronger business.</h1>
        <p class="mt-4 max-w-2xl text-lg text-base-content/70">
          Field notes on selling, stock, cash flow, customers, and the books behind a healthy duka.
        </p>
      </div>
    </section>

    <section class="mkt-container py-12 sm:py-16">
      @if (error()) {
        <div class="alert alert-error" role="alert">{{ error() }}</div>
      } @else if (posts().length) {
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          @for (post of posts(); track post.post_id) {
            <article class="card overflow-hidden border border-base-300 bg-base-100 shadow-sm">
              @if (cover(post); as image) {
                <a
                  [routerLink]="['/blog', post.slug]"
                  class="block aspect-[16/9] overflow-hidden bg-base-200"
                >
                  <img
                    [src]="image"
                    [alt]="post.cover_image_alt || ''"
                    class="h-full w-full object-cover"
                  />
                </a>
              }
              <div class="card-body gap-3 p-5">
                <div class="flex flex-wrap gap-2">
                  @for (tag of post.tags; track tag) {
                    <span class="badge badge-ghost badge-sm">{{ tag }}</span>
                  }
                </div>
                <h2 class="text-xl font-bold leading-tight">
                  <a [routerLink]="['/blog', post.slug]" class="hover:text-primary">{{
                    post.title
                  }}</a>
                </h2>
                <p class="text-sm text-base-content/70">{{ post.excerpt }}</p>
                <p class="mt-auto text-xs text-base-content/55">
                  {{ post.published_at | date: 'd MMM y' }} · {{ post.reading_minutes }} min read
                </p>
              </div>
            </article>
          }
        </div>
        @if (hasMore()) {
          <div class="mt-10 text-center">
            <button class="btn btn-outline" [disabled]="loadingMore()" (click)="loadMore()">
              {{ loadingMore() ? 'Loading…' : 'Load more articles' }}
            </button>
          </div>
        }
      } @else if (!loading()) {
        <div class="py-16 text-center">
          <h2 class="text-xl font-semibold">The first story is on its way.</h2>
          <p class="mt-2 text-base-content/65">Check back soon for practical business guides.</p>
        </div>
      } @else {
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading articles">
          @for (_ of [1, 2, 3]; track $index) {
            <div class="skeleton h-80 rounded-box"></div>
          }
        </div>
      }
    </section>
  `,
})
export class BlogListComponent implements OnInit {
  private readonly blog = inject(BlogService);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly posts = signal<BlogPostSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const posts = await this.blog.posts();
      this.posts.set(posts);
      this.hasMore.set(posts.length === 24);
      if (isPlatformBrowser(this.platformId)) {
        void this.blog
          .posts(true)
          .then(fresh => {
            this.posts.set(fresh);
            this.hasMore.set(fresh.length === 24);
          })
          .catch(() => undefined);
      }
    } catch {
      this.error.set('Articles could not be loaded. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  protected cover(post: BlogPostSummary): string | null {
    return this.blog.coverUrl(post.cover_image_path);
  }

  protected async loadMore(): Promise<void> {
    const before = this.posts().at(-1)?.published_at;
    if (!before || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const next = await this.blog.posts(false, before, this.posts().at(-1)?.post_id);
      const known = new Set(this.posts().map(post => post.post_id));
      this.posts.update(posts => [...posts, ...next.filter(post => !known.has(post.post_id))]);
      this.hasMore.set(next.length === 24);
    } catch {
      this.error.set('More articles could not be loaded. Please try again.');
    } finally {
      this.loadingMore.set(false);
    }
  }
}

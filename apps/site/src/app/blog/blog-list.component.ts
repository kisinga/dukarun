import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../shared/ui/icon.component';
import { BlogPostSummary, BlogService } from './blog.service';

@Component({
  selector: 'app-blog-list',
  imports: [RouterLink, DatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="journal-hero overflow-hidden border-b border-base-300/60">
      <div class="mkt-container relative py-16 sm:py-24">
        <div class="max-w-4xl">
          <p class="mkt-eyebrow">The Dukarun journal</p>
          <h1 class="mkt-display mt-4 max-w-4xl">
            Clear thinking for the people building everyday business.
          </h1>
          <p class="mkt-lead mt-6 max-w-2xl">
            Practical field notes on selling, stock, cash flow, customers, and the books behind a
            healthy duka.
          </p>
        </div>
        <div class="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-base-content/50">
          <span>Made in Nairobi</span>
          <span class="hidden h-1 w-1 rounded-full bg-primary sm:block"></span>
          <span>Written for Kenyan operators</span>
        </div>
      </div>
    </section>

    <section class="mkt-container py-10 sm:py-16">
      @if (error()) {
        <div class="alert alert-error" role="alert">{{ error() }}</div>
      } @else if (featured(); as lead) {
        <article
          class="group grid overflow-hidden rounded-[1.25rem] border border-base-300/70 bg-base-100 shadow-sm lg:grid-cols-[1.15fr_0.85fr]"
        >
          <a
            [routerLink]="['/blog', lead.slug]"
            class="relative block min-h-72 overflow-hidden bg-neutral sm:min-h-96 lg:min-h-[30rem]"
            aria-label="Read {{ lead.title }}"
          >
            @if (cover(lead); as image) {
              <img
                [src]="image"
                [alt]="lead.cover_image_alt || ''"
                fetchpriority="high"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
              />
            } @else {
              <div
                class="journal-art absolute inset-0 flex flex-col justify-between p-7 text-neutral-content sm:p-10"
              >
                <span
                  class="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-content/55"
                  >Field note · 01</span
                >
                <div>
                  <span class="block text-7xl font-bold tracking-[-0.07em] text-primary sm:text-9xl"
                    >D.</span
                  >
                  <p class="mt-3 max-w-sm text-sm text-neutral-content/55">
                    Useful ideas for the work behind the counter.
                  </p>
                </div>
              </div>
            }
          </a>
          <div class="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
            <div
              class="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary"
            >
              <span>{{ lead.tags[0] || 'Field notes' }}</span>
              <span class="text-base-content/25">/</span>
              <span class="text-base-content/45">Featured</span>
            </div>
            <h2 class="mt-5 text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl">
              <a [routerLink]="['/blog', lead.slug]" class="transition-colors hover:text-primary">{{
                lead.title
              }}</a>
            </h2>
            <p class="mt-5 text-base leading-relaxed text-base-content/65 sm:text-lg">
              {{ lead.excerpt }}
            </p>
            <div
              class="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-base-content/50"
            >
              <span>{{ lead.published_at | date: 'd MMM y' }}</span>
              <span>{{ lead.reading_minutes }} min read</span>
            </div>
            <a
              [routerLink]="['/blog', lead.slug]"
              class="mt-8 inline-flex min-h-11 items-center gap-2 self-start font-semibold text-primary"
            >
              Read the story
              <app-icon name="heroArrowRight" size="sm" />
            </a>
          </div>
        </article>

        @if (morePosts().length) {
          <div class="mb-6 mt-16 flex items-end justify-between border-b border-base-300/70 pb-4">
            <div>
              <p class="mkt-eyebrow">Latest notes</p>
              <h2 class="mt-1 text-2xl font-bold tracking-tight">More from the journal</h2>
            </div>
          </div>
          <div class="grid gap-x-7 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            @for (post of morePosts(); track post.post_id; let index = $index) {
              <article class="group flex min-w-0 flex-col">
                <a
                  [routerLink]="['/blog', post.slug]"
                  class="relative block aspect-[16/10] overflow-hidden rounded-xl bg-neutral"
                >
                  @if (cover(post); as image) {
                    <img
                      [src]="image"
                      [alt]="post.cover_image_alt || ''"
                      loading="lazy"
                      class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                    />
                  } @else {
                    <div
                      class="journal-art absolute inset-0 flex items-end justify-between p-6 text-neutral-content"
                    >
                      <span class="text-5xl font-bold tracking-[-0.06em] text-primary">{{
                        (index + 2).toString().padStart(2, '0')
                      }}</span>
                      <span
                        class="max-w-24 text-right text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-content/50"
                        >Dukarun journal</span
                      >
                    </div>
                  }
                </a>
                <div class="mt-5 flex items-center gap-3 text-xs font-medium text-base-content/45">
                  <span class="uppercase tracking-wider text-primary">{{
                    post.tags[0] || 'Field notes'
                  }}</span>
                  <span>{{ post.reading_minutes }} min</span>
                </div>
                <h3 class="mt-3 text-2xl font-bold leading-tight tracking-tight">
                  <a
                    [routerLink]="['/blog', post.slug]"
                    class="transition-colors hover:text-primary"
                    >{{ post.title }}</a
                  >
                </h3>
                <p class="mt-3 line-clamp-3 text-sm leading-relaxed text-base-content/60">
                  {{ post.excerpt }}
                </p>
                <p class="mt-5 text-xs text-base-content/40">
                  {{ post.published_at | date: 'd MMMM y' }}
                </p>
              </article>
            }
          </div>
        }
        @if (hasMore()) {
          <div class="mt-14 flex justify-center border-t border-base-300/60 pt-8">
            <button
              class="btn btn-outline min-h-11 min-w-44"
              [disabled]="loadingMore()"
              (click)="loadMore()"
            >
              {{ loadingMore() ? 'Loading…' : 'Load more articles' }}
            </button>
          </div>
        }
      } @else if (!loading()) {
        <div class="rounded-[1.25rem] border border-dashed border-base-300 px-6 py-24 text-center">
          <p class="mkt-eyebrow">The journal</p>
          <h2 class="mt-3 text-2xl font-bold">The first story is on its way.</h2>
          <p class="mt-2 text-base-content/60">Check back soon for practical business guides.</p>
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
  styles: `
    .journal-hero {
      background:
        radial-gradient(
          circle at 82% 18%,
          color-mix(in oklab, var(--color-primary) 14%, transparent),
          transparent 28rem
        ),
        linear-gradient(
          180deg,
          var(--color-base-100),
          color-mix(in oklab, var(--color-base-200) 52%, var(--color-base-100))
        );
    }
    .journal-art {
      background:
        linear-gradient(
          120deg,
          transparent 0 64%,
          color-mix(in oklab, var(--color-primary) 22%, transparent) 64% 65%,
          transparent 65%
        ),
        radial-gradient(
          circle at 78% 22%,
          color-mix(in oklab, var(--color-primary) 20%, transparent),
          transparent 32%
        ),
        var(--color-neutral);
    }
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
  protected readonly featured = computed(() => this.posts()[0] ?? null);
  protected readonly morePosts = computed(() => this.posts().slice(1));

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

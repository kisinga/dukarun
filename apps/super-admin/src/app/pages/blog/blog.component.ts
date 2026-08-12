import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { renderSafeMarkdown } from '@dukarun/legal-markdown';
import {
  PlatformBlogMetrics,
  PlatformBlogPost,
  PlatformService,
  SiteDeployment,
} from '../../core/platform.service';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

@Component({
  selector: 'app-platform-blog',
  imports: [ReactiveFormsModule, DatePipe, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Editorial" subtitle="Write and publish stories for the Dukarun journal">
      <button actions class="btn btn-primary min-h-11" (click)="newPost()">New article</button>
    </app-page-header>

    @if (error()) {
      <div class="alert alert-error mb-5" role="alert">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="alert alert-success mb-5" role="status">{{ notice() }}</div>
    }

    <div
      class="editor-shell grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[15rem_minmax(0,1fr)_18rem]"
    >
      <aside
        class="order-3 rounded-box border border-base-300/70 bg-base-100 lg:order-none lg:col-start-1 lg:row-start-1 2xl:sticky 2xl:top-5"
      >
        <div class="border-b border-base-200 p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-base-content/45">
                Journal
              </p>
              <h2 class="mt-1 font-semibold">All articles</h2>
            </div>
            <span class="badge badge-neutral badge-sm">{{ posts().length }}</span>
          </div>
          <input
            type="search"
            class="input input-bordered input-sm mt-4 w-full bg-base-200/45"
            placeholder="Search titles…"
            [value]="searchQuery()"
            (input)="searchQuery.set($any($event.target).value)"
          />
        </div>
        <div class="max-h-72 space-y-1 overflow-y-auto p-2 lg:max-h-[46vh] 2xl:max-h-[68vh]">
          @for (post of filteredPosts(); track post.post_id) {
            <button
              type="button"
              class="group w-full rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:bg-base-200/70"
              [class.border-primary]="selected()?.post_id === post.post_id"
              [class.bg-primary/10]="selected()?.post_id === post.post_id"
              (click)="selectPost(post)"
            >
              <div class="flex items-start gap-2.5">
                <span
                  class="mt-1.5 size-2 shrink-0 rounded-full"
                  [class.bg-success]="post.publication_state === 'published'"
                  [class.bg-warning]="post.publication_state === 'scheduled'"
                  [class.bg-primary]="post.publication_state === 'draft'"
                  [class.bg-base-300]="
                    post.publication_state !== 'published' &&
                    post.publication_state !== 'scheduled' &&
                    post.publication_state !== 'draft'
                  "
                ></span>
                <span class="min-w-0 flex-1">
                  <strong class="line-clamp-2 text-sm font-medium leading-snug">{{
                    post.title || 'Untitled article'
                  }}</strong>
                  @if (post.featured_at) {
                    <span class="badge badge-primary badge-xs mt-1">Featured</span>
                  }
                  <span class="mt-1 block truncate text-xs text-base-content/45"
                    >/{{ post.slug }}</span
                  >
                </span>
              </div>
            </button>
          } @empty {
            <div class="px-4 py-12 text-center">
              <p class="text-sm font-medium">No articles found</p>
              <p class="mt-1 text-xs text-base-content/50">Start with a fresh draft.</p>
            </div>
          }
        </div>
      </aside>

      <form class="contents" (submit)="$event.preventDefault(); save()">
        <main
          class="order-1 min-w-0 overflow-hidden rounded-box border border-base-300/70 bg-base-100 shadow-sm lg:col-start-2 lg:row-span-2 lg:row-start-1 2xl:col-start-auto 2xl:row-span-1"
        >
          <header
            class="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-base-200 px-5 py-3"
          >
            <div class="flex items-center gap-2">
              <span
                class="size-2 rounded-full"
                [class.bg-primary]="!selected() || selected()?.publication_state === 'draft'"
                [class.bg-success]="selected()?.publication_state === 'published'"
                [class.bg-warning]="selected()?.publication_state === 'scheduled'"
                [class.bg-base-300]="selected()?.publication_state === 'archived'"
              ></span>
              <span class="text-sm font-medium capitalize">{{
                selected()?.publication_state || 'New draft'
              }}</span>
              @if (editorDirty()) {
                <span class="text-xs text-base-content/45">Unsaved changes</span>
              } @else if (selected()) {
                <span class="text-xs text-base-content/45">Saved</span>
              }
            </div>
            <div class="flex items-center gap-2">
              @if (selected()?.publication_state === 'draft') {
                <button
                  type="button"
                  class="btn btn-ghost btn-sm min-h-10 text-success"
                  [disabled]="busy() || editorDirty()"
                  (click)="publish()"
                >
                  Publish
                </button>
              }
              <button
                type="submit"
                class="btn btn-primary btn-sm min-h-10 px-5"
                [disabled]="busy() || invalid()"
              >
                {{ busy() ? 'Saving…' : selected() ? 'Save draft' : 'Create draft' }}
              </button>
            </div>
          </header>

          <div class="mx-auto max-w-4xl px-5 py-8 sm:px-10 sm:py-12">
            <input
              class="editor-title w-full bg-transparent text-3xl font-bold leading-tight tracking-tight outline-none placeholder:text-base-content/25 sm:text-5xl"
              maxlength="120"
              placeholder="Article title"
              aria-label="Article title"
              [formControl]="title"
              (input)="titleChanged()"
            />
            <div class="mt-4 flex min-w-0 items-center gap-1 text-sm text-base-content/45">
              <span class="shrink-0">dukarun.com/blog/</span>
              <input
                class="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-base-content/25"
                maxlength="100"
                placeholder="article-slug"
                aria-label="Article URL slug"
                [formControl]="slug"
                (input)="slugEdited.set(true)"
              />
            </div>
            <textarea
              class="mt-7 w-full resize-none bg-transparent text-lg leading-relaxed text-base-content/65 outline-none placeholder:text-base-content/25"
              rows="3"
              maxlength="320"
              placeholder="A short summary that gives readers a reason to continue…"
              aria-label="Article excerpt"
              [formControl]="excerpt"
            ></textarea>

            <div class="mt-5 flex items-center justify-between border-b border-base-200">
              <div class="flex gap-1" role="tablist" aria-label="Editor view">
                <button
                  type="button"
                  class="editor-tab"
                  [class.editor-tab-active]="editorMode() === 'write'"
                  (click)="editorMode.set('write')"
                >
                  Write
                </button>
                <button
                  type="button"
                  class="editor-tab"
                  [class.editor-tab-active]="editorMode() === 'preview'"
                  (click)="editorMode.set('preview')"
                >
                  Preview
                </button>
              </div>
              <span class="pb-3 text-xs text-base-content/40"
                >{{ markdown.value.length }} characters</span
              >
            </div>
            @if (editorMode() === 'write') {
              <div class="flex flex-wrap items-center gap-1 border-b border-base-200 py-2">
                <button
                  type="button"
                  class="format-button font-bold"
                  title="Bold"
                  aria-label="Bold selected text"
                  (click)="formatMarkdown('bold')"
                >
                  B
                </button>
                <button
                  type="button"
                  class="format-button italic"
                  title="Italic"
                  aria-label="Italicize selected text"
                  (click)="formatMarkdown('italic')"
                >
                  I
                </button>
                <button
                  type="button"
                  class="format-button"
                  title="Heading"
                  aria-label="Add heading"
                  (click)="formatMarkdown('heading')"
                >
                  H2
                </button>
                <span class="mx-1 h-5 w-px bg-base-200"></span>
                <button
                  type="button"
                  class="format-button"
                  aria-label="Add bulleted list"
                  (click)="formatMarkdown('list')"
                >
                  • List
                </button>
                <button
                  type="button"
                  class="format-button"
                  aria-label="Add link"
                  (click)="formatMarkdown('link')"
                >
                  Link
                </button>
                <button
                  type="button"
                  class="format-button"
                  aria-label="Add quote"
                  (click)="formatMarkdown('quote')"
                >
                  Quote
                </button>
              </div>
              <textarea
                #markdownEditor
                class="editor-body mt-6 min-h-[38rem] w-full resize-y bg-transparent font-mono text-[0.925rem] leading-7 outline-none placeholder:text-base-content/25"
                [formControl]="markdown"
                (input)="updatePreview()"
                placeholder="Start writing in Markdown…"
                aria-label="Article content in Markdown"
              ></textarea>
            } @else {
              <article
                class="blog-preview mt-6 min-h-[38rem] text-base-content/85"
                [innerHTML]="preview()"
              ></article>
            }
          </div>
        </main>

        <aside
          class="order-2 space-y-4 lg:order-none lg:col-start-1 lg:row-start-2 2xl:col-start-3 2xl:row-start-1 2xl:sticky 2xl:top-5"
        >
          <section class="rounded-box border border-base-300/70 bg-base-100 shadow-sm">
            <div class="border-b border-base-200 px-4 py-3">
              <h2 class="text-sm font-semibold">Publish</h2>
            </div>
            <div class="space-y-4 p-4">
              <div class="flex items-center justify-between text-sm">
                <span class="text-base-content/55">Status</span>
                <span class="badge badge-ghost badge-sm capitalize">{{
                  selected()?.publication_state || 'Unsaved'
                }}</span>
              </div>
              @if (selected()?.featured_at) {
                <p class="rounded-lg bg-primary/10 p-3 text-xs leading-relaxed text-primary">
                  This is the featured story on the homepage and blog page.
                </p>
              }
              <label class="form-control gap-1.5">
                <span class="text-xs font-medium text-base-content/60">Schedule in Nairobi</span>
                <input
                  type="datetime-local"
                  class="input input-bordered input-sm w-full"
                  [formControl]="scheduledFor"
                />
              </label>
              <div class="grid gap-2">
                @if (selected()?.publication_state === 'draft') {
                  <button
                    type="button"
                    class="btn btn-success min-h-11 w-full"
                    [disabled]="busy() || editorDirty()"
                    (click)="publish()"
                  >
                    Publish now
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline min-h-11 w-full"
                    [disabled]="busy() || !scheduledFor.value || editorDirty()"
                    (click)="schedule()"
                  >
                    Schedule article
                  </button>
                } @else if (!selected()) {
                  <p
                    class="rounded-lg bg-base-200/60 p-3 text-xs leading-relaxed text-base-content/55"
                  >
                    Create the draft first, then add a cover and publish it.
                  </p>
                }
                @if (editorDirty() && selected()) {
                  <p class="text-xs leading-relaxed text-warning">
                    Save your changes before publishing or scheduling.
                  </p>
                }
                @if (selected()?.publication_state === 'scheduled') {
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm w-full"
                    [disabled]="busy()"
                    (click)="cancelSchedule()"
                  >
                    Cancel schedule
                  </button>
                }
                @if (selected()?.publication_state === 'published') {
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm text-error"
                    [disabled]="busy()"
                    (click)="archive()"
                  >
                    Archive article
                  </button>
                }
                @if (selected()?.has_published_version && !selected()?.featured_at) {
                  <button
                    type="button"
                    class="btn btn-outline btn-sm w-full"
                    [disabled]="busy()"
                    (click)="feature()"
                  >
                    Feature on website
                  </button>
                }
              </div>
            </div>
          </section>

          <section class="rounded-box border border-base-300/70 bg-base-100">
            <div class="border-b border-base-200 px-4 py-3">
              <h2 class="text-sm font-semibold">Story details</h2>
            </div>
            <div class="space-y-4 p-4">
              <div>
                <span class="mb-2 block text-xs font-medium text-base-content/60">Cover image</span>
                @if (coverUrl(); as image) {
                  <div class="relative overflow-hidden rounded-lg bg-base-200">
                    <img
                      [src]="image"
                      [alt]="coverAlt.value"
                      class="aspect-video w-full object-cover"
                    />
                  </div>
                }
                <label
                  class="mt-2 flex min-h-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-200/35 px-3 text-center text-xs text-base-content/55 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  [class.pointer-events-none]="!selected() || busy()"
                  [class.opacity-50]="!selected() || busy()"
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml,.svg"
                    class="sr-only"
                    [disabled]="!selected() || busy()"
                    (change)="uploadCover($event)"
                  />
                  {{
                    selected()
                      ? coverUrl()
                        ? 'Replace image'
                        : 'Choose image'
                      : 'Save draft to upload'
                  }}
                </label>
              </div>
              <label class="form-control gap-1.5">
                <span class="text-xs font-medium text-base-content/60">Image description</span>
                <input
                  class="input input-bordered input-sm w-full"
                  maxlength="200"
                  placeholder="Describe the image"
                  [formControl]="coverAlt"
                />
              </label>
              <label class="form-control gap-1.5">
                <span class="text-xs font-medium text-base-content/60">Author</span>
                <input
                  class="input input-bordered input-sm w-full"
                  maxlength="120"
                  [formControl]="author"
                />
              </label>
              <label class="form-control gap-1.5">
                <span class="text-xs font-medium text-base-content/60">Tags</span>
                <input
                  class="input input-bordered input-sm w-full"
                  placeholder="stock, cash-flow"
                  [formControl]="tags"
                />
                <span class="text-[0.68rem] text-base-content/40">Separate tags with commas</span>
              </label>
            </div>
          </section>

          <section class="rounded-box border border-base-300/70 bg-base-100">
            <div class="border-b border-base-200 px-4 py-3">
              <h2 class="text-sm font-semibold">Article image</h2>
            </div>
            <div class="space-y-3 p-4">
              <label class="form-control gap-1.5">
                <span class="text-xs font-medium text-base-content/60">Image description</span>
                <input
                  class="input input-bordered input-sm w-full"
                  maxlength="200"
                  placeholder="What the screenshot shows"
                  [formControl]="inlineImageAlt"
                />
              </label>
              <label
                class="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-200/35 px-3 text-center text-xs font-semibold text-base-content/60 transition-colors hover:border-primary/40 hover:bg-primary/5"
                [class.pointer-events-none]="!selected() || busy() || !inlineImageAlt.value.trim()"
                [class.opacity-50]="!selected() || busy() || !inlineImageAlt.value.trim()"
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml,.svg"
                  class="sr-only"
                  [disabled]="!selected() || busy() || !inlineImageAlt.value.trim()"
                  (change)="uploadInlineImage($event)"
                />
                {{ selected() ? 'Upload and insert at cursor' : 'Save draft to upload' }}
              </label>
              <p class="mb-0 text-[0.68rem] leading-relaxed text-base-content/45">
                JPEG, PNG, WebP, or safe SVG up to 5 MB. The description is required for
                accessibility.
              </p>
            </div>
          </section>

          <details
            class="collapse collapse-arrow rounded-box border border-base-300/70 bg-base-100"
          >
            <summary class="collapse-title min-h-12 py-3 text-sm font-semibold">
              Search preview
            </summary>
            <div class="collapse-content space-y-3">
              <div class="rounded-lg border border-base-200 bg-base-200/30 p-3">
                <p class="truncate text-xs text-success">dukarun.com › blog › {{ slug.value }}</p>
                <p class="mt-1 line-clamp-1 text-base font-medium text-primary">
                  {{ seoTitle.value || title.value || 'Article title' }}
                </p>
                <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-base-content/55">
                  {{ seoDescription.value || excerpt.value || 'Article description' }}
                </p>
              </div>
              <label class="form-control gap-1">
                <span class="text-xs text-base-content/55">SEO title</span>
                <input
                  class="input input-bordered input-sm w-full"
                  maxlength="70"
                  [formControl]="seoTitle"
                />
              </label>
              <label class="form-control gap-1">
                <span class="text-xs text-base-content/55">SEO description</span>
                <textarea
                  class="textarea textarea-bordered textarea-sm w-full"
                  rows="3"
                  maxlength="180"
                  [formControl]="seoDescription"
                ></textarea>
              </label>
            </div>
          </details>
        </aside>
      </form>
    </div>

    @if (metrics(); as m) {
      <details
        class="collapse collapse-arrow mt-6 rounded-box border border-base-300/70 bg-base-100"
      >
        <summary class="collapse-title min-h-16 py-4">
          <span class="font-semibold">Performance</span>
          <span class="ml-2 text-sm font-normal text-base-content/45">Last 30 days</span>
        </summary>
        <div class="collapse-content">
          <div
            class="grid gap-px overflow-hidden rounded-lg border border-base-200 bg-base-200 sm:grid-cols-5"
          >
            @for (card of metricCards(m); track card.label) {
              <div class="bg-base-100 p-4">
                <p class="text-xs text-base-content/45">{{ card.label }}</p>
                <strong class="mt-1 block text-2xl font-semibold">{{ card.value }}</strong>
              </div>
            }
          </div>
          @if (m.posts.length) {
            <div class="mt-5 overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th class="text-right">Views</th>
                    <th class="text-right">Readers</th>
                    <th class="text-right">CTA</th>
                    <th class="text-right">Registrations</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of m.posts; track row.post_id) {
                    <tr>
                      <td>
                        <strong>{{ row.title }}</strong>
                        <span class="ml-2 text-xs text-base-content/40">/{{ row.slug }}</span>
                      </td>
                      <td class="text-right">{{ row.views }}</td>
                      <td class="text-right">{{ row.unique_readers }}</td>
                      <td class="text-right">{{ row.cta_clicks }}</td>
                      <td class="text-right">{{ row.registrations }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </details>
    }

    @if (deployments().length) {
      <details
        class="collapse collapse-arrow mt-4 rounded-box border border-base-300/70 bg-base-100"
      >
        <summary class="collapse-title min-h-14 py-4 text-sm font-semibold">
          Site deployments
          <span class="ml-2 font-normal text-base-content/45"
            >{{ deployments().length }} recent</span
          >
        </summary>
        <div class="collapse-content">
          <div class="divide-y divide-base-200">
            @for (deployment of deployments(); track deployment.id) {
              <div class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>{{ deployment.created_at | date: 'd MMM y, HH:mm' }}</span>
                <span
                  class="badge badge-sm"
                  [class.badge-success]="deployment.status === 'succeeded'"
                  [class.badge-error]="
                    deployment.status === 'failed' || deployment.status === 'timed_out'
                  "
                  >{{ deployment.status }}</span
                >
                @if (deployment.error_summary) {
                  <span class="w-full text-error">{{ deployment.error_summary }}</span>
                }
              </div>
            }
          </div>
        </div>
      </details>
    }
  `,
  styles: `
    .editor-tab {
      border-bottom: 2px solid transparent;
      padding: 0.75rem 0.9rem;
      color: color-mix(in oklab, var(--color-base-content) 52%, transparent);
      font-size: 0.8125rem;
      font-weight: 600;
      transition:
        color 150ms ease,
        border-color 150ms ease;
    }
    .editor-tab:hover {
      color: var(--color-base-content);
    }
    .editor-tab-active {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .editor-title,
    .editor-body {
      caret-color: var(--color-primary);
    }
    .format-button {
      min-height: 2rem;
      border-radius: 0.45rem;
      padding: 0.25rem 0.55rem;
      color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
      font-size: 0.75rem;
      font-weight: 600;
      transition:
        color 150ms ease,
        background 150ms ease;
    }
    .format-button:hover {
      background: var(--color-base-200);
      color: var(--color-base-content);
    }
    :host ::ng-deep .blog-preview h1,
    :host ::ng-deep .blog-preview h2,
    :host ::ng-deep .blog-preview h3 {
      margin: 1.25rem 0 0.5rem;
      font-weight: 750;
    }
    :host ::ng-deep .blog-preview h1 {
      font-size: 2.25rem;
      line-height: 1.15;
    }
    :host ::ng-deep .blog-preview h2 {
      font-size: 1.5rem;
      line-height: 1.25;
    }
    :host ::ng-deep .blog-preview p {
      margin-bottom: 1.15rem;
      line-height: 1.75;
    }
    :host ::ng-deep .blog-preview ul {
      margin: 0 0 1rem 1.25rem;
      list-style: disc;
    }
    :host ::ng-deep .blog-preview ol {
      margin: 0 0 1rem 1.25rem;
      list-style: decimal;
    }
    :host ::ng-deep .blog-preview a {
      color: var(--color-primary);
      text-decoration: underline;
    }
    :host ::ng-deep .blog-preview blockquote {
      margin: 1.5rem 0;
      border-left: 3px solid var(--color-primary);
      padding-left: 1rem;
      color: color-mix(in oklab, var(--color-base-content) 68%, transparent);
    }
    :host ::ng-deep .blog-preview figure {
      margin: 1.5rem 0;
    }
    :host ::ng-deep .blog-preview img {
      width: 100%;
      border-radius: 0.75rem;
      border: 1px solid var(--color-base-300);
    }
    :host ::ng-deep .blog-preview pre {
      margin: 1.5rem 0;
      overflow-x: auto;
      border-radius: 0.75rem;
      background: var(--color-base-200);
      padding: 1rem;
    }
  `,
})
export class BlogComponent implements OnInit {
  @ViewChild('markdownEditor') private markdownEditor?: ElementRef<HTMLTextAreaElement>;
  private readonly platform = inject(PlatformService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly posts = signal<PlatformBlogPost[]>([]);
  protected readonly selected = signal<PlatformBlogPost | null>(null);
  protected readonly metrics = signal<PlatformBlogMetrics | null>(null);
  protected readonly deployments = signal<SiteDeployment[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly preview = signal<SafeHtml>('');
  protected readonly coverPath = signal<string | null>(null);
  protected readonly coverUrl = signal<string | null>(null);
  protected readonly coverChanged = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly slugEdited = signal(false);
  protected readonly editorMode = signal<'write' | 'preview'>('write');
  protected readonly title = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly slug = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
  });
  protected readonly author = new FormControl('Dukarun team', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly excerpt = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly markdown = new FormControl('# Article title\n\nStart writing here.', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly tags = new FormControl('', { nonNullable: true });
  protected readonly seoTitle = new FormControl('', { nonNullable: true });
  protected readonly seoDescription = new FormControl('', { nonNullable: true });
  protected readonly coverAlt = new FormControl('', { nonNullable: true });
  protected readonly inlineImageAlt = new FormControl('', { nonNullable: true });
  protected readonly scheduledFor = new FormControl('', { nonNullable: true });
  protected readonly filteredPosts = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    return query
      ? this.posts().filter(post => `${post.title} ${post.slug}`.toLowerCase().includes(query))
      : this.posts();
  });

  async ngOnInit(): Promise<void> {
    this.updatePreview();
    await this.load();
  }

  protected invalid(): boolean {
    return (
      this.title.invalid ||
      this.slug.invalid ||
      this.author.invalid ||
      this.excerpt.invalid ||
      this.markdown.invalid
    );
  }
  protected metricCards(m: PlatformBlogMetrics) {
    return [
      { label: 'Views', value: m.views },
      { label: 'Unique readers', value: m.unique_readers },
      { label: 'Engaged', value: m.engaged_readers },
      { label: 'CTA clicks', value: m.cta_clicks },
      { label: 'Registrations', value: m.registrations },
    ];
  }

  protected editorDirty(): boolean {
    return (
      this.coverChanged() ||
      [
        this.title,
        this.slug,
        this.author,
        this.excerpt,
        this.markdown,
        this.tags,
        this.seoTitle,
        this.seoDescription,
        this.coverAlt,
      ].some(control => control.dirty)
    );
  }

  protected newPost(): void {
    this.selected.set(null);
    this.title.setValue('');
    this.slug.setValue('');
    this.author.setValue('Dukarun team');
    this.excerpt.setValue('');
    this.markdown.setValue('# Article title\n\nStart writing here.');
    this.tags.setValue('');
    this.seoTitle.setValue('');
    this.seoDescription.setValue('');
    this.coverAlt.setValue('');
    this.inlineImageAlt.setValue('');
    this.scheduledFor.setValue('');
    this.coverPath.set(null);
    this.coverUrl.set(null);
    this.slugEdited.set(false);
    this.editorMode.set('write');
    this.updatePreview();
    this.markEditorPristine();
  }

  protected async selectPost(post: PlatformBlogPost): Promise<void> {
    await this.run(async () => this.applyPost(await this.platform.blogPost(post.post_id)));
  }

  private applyPost(post: PlatformBlogPost): void {
    this.selected.set(post);
    this.title.setValue(post.title ?? '');
    this.slug.setValue(post.slug);
    this.author.setValue(post.author_name ?? 'Dukarun team');
    this.excerpt.setValue(post.excerpt ?? '');
    this.markdown.setValue(post.content_markdown ?? '');
    this.tags.setValue((post.tags ?? []).join(', '));
    this.seoTitle.setValue(post.seo_title ?? '');
    this.seoDescription.setValue(post.seo_description ?? '');
    this.coverAlt.setValue(post.cover_image_alt ?? '');
    this.inlineImageAlt.setValue('');
    this.scheduledFor.setValue(post.scheduled_for ? this.localDateTime(post.scheduled_for) : '');
    this.coverPath.set(post.cover_image_path);
    this.coverUrl.set(this.platform.blogCoverUrl(post.cover_image_path));
    this.slugEdited.set(true);
    this.updatePreview();
    this.markEditorPristine();
  }

  protected titleChanged(): void {
    if (!this.slugEdited()) {
      this.slug.setValue(
        this.title.value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 100)
          .replace(/-$/g, '')
      );
    }
    this.updatePreview();
  }

  protected updatePreview(): void {
    this.preview.set(
      this.sanitizer.bypassSecurityTrustHtml(renderSafeMarkdown(this.markdown.value).html)
    );
  }

  protected formatMarkdown(kind: 'bold' | 'italic' | 'heading' | 'list' | 'link' | 'quote'): void {
    const editor = this.markdownEditor?.nativeElement;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const value = this.markdown.value;
    const selected = value.slice(start, end);
    const formats = {
      bold: { prefix: '**', suffix: '**', fallback: 'bold text' },
      italic: { prefix: '_', suffix: '_', fallback: 'italic text' },
      heading: { prefix: '## ', suffix: '', fallback: 'Heading' },
      list: { prefix: '- ', suffix: '', fallback: 'List item' },
      link: { prefix: '[', suffix: '](https://)', fallback: 'link text' },
      quote: { prefix: '> ', suffix: '', fallback: 'Quote' },
    } as const;
    const format = formats[kind];
    const content = selected || format.fallback;
    const replacement = `${format.prefix}${content}${format.suffix}`;
    this.markdown.setValue(value.slice(0, start) + replacement + value.slice(end));
    this.markdown.markAsDirty();
    this.updatePreview();
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(
        start + format.prefix.length,
        start + format.prefix.length + content.length
      );
    });
  }

  protected async save(): Promise<void> {
    if (this.invalid()) return;
    await this.run(async () => {
      const result = await this.platform.saveBlogDraft({
        postId: this.selected()?.post_id ?? null,
        slug: this.slug.value,
        title: this.title.value,
        excerpt: this.excerpt.value,
        markdown: this.markdown.value,
        authorName: this.author.value,
        coverImagePath: this.coverPath(),
        coverImageAlt: this.coverAlt.value || null,
        tags: this.normalizedTags(),
        seoTitle: this.seoTitle.value || null,
        seoDescription: this.seoDescription.value || null,
      });
      this.notice.set('Draft saved');
      await this.load(result.post_id);
    });
  }

  protected async publish(): Promise<void> {
    const id = this.selected()?.post_id;
    if (!id || this.editorDirty()) return;
    await this.run(async () => {
      await this.platform.publishBlogPost(id);
      this.notice.set('Article published');
      await this.load(id);
    });
  }
  protected async schedule(): Promise<void> {
    const id = this.selected()?.post_id;
    if (!id || !this.scheduledFor.value || this.editorDirty()) return;
    await this.run(async () => {
      await this.platform.scheduleBlogPost(
        id,
        new Date(`${this.scheduledFor.value}:00+03:00`).toISOString()
      );
      this.notice.set('Article scheduled');
      await this.load(id);
    });
  }
  protected async feature(): Promise<void> {
    const id = this.selected()?.post_id;
    if (!id) return;
    await this.run(async () => {
      await this.platform.featureBlogPost(id);
      this.notice.set('Featured story updated on the homepage and blog page');
      await this.load(id);
    });
  }
  protected async cancelSchedule(): Promise<void> {
    const id = this.selected()?.post_id;
    if (!id) return;
    await this.run(async () => {
      await this.platform.cancelScheduledBlogPost(id);
      this.notice.set('Schedule cancelled');
      await this.load(id);
    });
  }
  protected async archive(): Promise<void> {
    const id = this.selected()?.post_id;
    if (!id || !confirm('Archive this public article?')) return;
    await this.run(async () => {
      await this.platform.archiveBlogPost(id);
      this.notice.set('Article archived');
      await this.load();
      this.newPost();
    });
  }

  protected async uploadCover(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const id = this.selected()?.post_id;
    if (!file || !id) return;
    if (!this.validBlogImage(file)) {
      this.error.set('Use a JPEG, PNG, WebP, or safe SVG image up to 5 MB.');
      input.value = '';
      return;
    }
    await this.run(async () => {
      const path = await this.platform.uploadBlogCover(id, file);
      this.coverPath.set(path);
      this.coverUrl.set(this.platform.blogCoverUrl(path));
      this.coverChanged.set(true);
      this.notice.set('Cover uploaded; save the draft to attach it.');
    });
    input.value = '';
  }

  protected async uploadInlineImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const id = this.selected()?.post_id;
    const alt = this.inlineImageAlt.value.trim();
    if (!file || !id || !alt) {
      this.error.set('Describe the image before uploading it.');
      input.value = '';
      return;
    }
    if (!this.validBlogImage(file)) {
      this.error.set('Use a JPEG, PNG, WebP, or safe SVG image up to 5 MB.');
      input.value = '';
      return;
    }
    const editor = this.markdownEditor?.nativeElement;
    const start = editor?.selectionStart ?? this.markdown.value.length;
    const end = editor?.selectionEnd ?? start;
    await this.run(async () => {
      const path = await this.platform.uploadBlogMedia(id, file);
      const url = this.platform.blogMediaUrl(path);
      const imageMarkdown = `![${alt.replaceAll(']', '')}](${url})`;
      this.insertMarkdownBlock(imageMarkdown, start, end);
      this.inlineImageAlt.setValue('');
      this.notice.set('Image uploaded and inserted; save the draft to keep the change.');
    });
    input.value = '';
  }

  private validBlogImage(file: File): boolean {
    return (
      file.size <= 5 * 1024 * 1024 &&
      ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)
    );
  }

  private insertMarkdownBlock(markdown: string, start: number, end: number): void {
    const value = this.markdown.value;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix =
      before.length > 0 && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const suffix =
      after.length > 0 && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
    const inserted = `${prefix}${markdown}${suffix}`;
    this.markdown.setValue(before + inserted + after);
    this.markdown.markAsDirty();
    this.updatePreview();
    requestAnimationFrame(() => {
      const editor = this.markdownEditor?.nativeElement;
      if (!editor) return;
      const cursor = before.length + inserted.length;
      editor.focus();
      editor.setSelectionRange(cursor, cursor);
    });
  }

  private async load(selectId?: string): Promise<void> {
    const [posts, metrics, deployments] = await Promise.all([
      this.platform.blogPosts(),
      this.platform.blogMetrics(),
      this.platform.siteDeployments(),
    ]);
    this.posts.set(posts);
    this.metrics.set(metrics);
    this.deployments.set(deployments);
    const id = selectId ?? this.selected()?.post_id;
    if (id) {
      const post = posts.find(item => item.post_id === id);
      if (post) this.applyPost(await this.platform.blogPost(id));
    }
  }
  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await task();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Blog action failed');
    } finally {
      this.busy.set(false);
    }
  }
  private normalizedTags(): string[] {
    return [
      ...new Set(
        this.tags.value
          .split(',')
          .map(tag =>
            tag
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          )
          .filter(Boolean)
      ),
    ].slice(0, 10);
  }
  private markEditorPristine(): void {
    for (const control of [
      this.title,
      this.slug,
      this.author,
      this.excerpt,
      this.markdown,
      this.tags,
      this.seoTitle,
      this.seoDescription,
      this.coverAlt,
    ]) {
      control.markAsPristine();
    }
    this.coverChanged.set(false);
  }
  private localDateTime(value: string): string {
    return new Date(value)
      .toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi', hour12: false })
      .replace(' ', 'T')
      .slice(0, 16);
  }
}

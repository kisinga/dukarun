import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
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
    <app-page-header title="Blog" subtitle="Draft, publish, schedule, and measure public articles">
      <button actions class="btn btn-primary btn-sm min-h-11" (click)="newPost()">
        New article
      </button>
    </app-page-header>

    @if (error()) {
      <div class="alert alert-error mb-4" role="alert">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="alert alert-success mb-4" role="status">{{ notice() }}</div>
    }

    @if (metrics(); as m) {
      <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        @for (card of metricCards(m); track card.label) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <p class="type-caption">{{ card.label }}</p>
              <strong class="type-hero">{{ card.value }}</strong>
            </div>
          </div>
        }
      </div>
      @if (m.posts.length) {
        <section class="card mb-4 bg-base-100">
          <div class="card-body p-4">
            <h2 class="type-heading">Article performance</h2>
            <div class="overflow-x-auto">
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
                        <strong>{{ row.title }}</strong
                        ><span class="type-caption ml-2">/{{ row.slug }}</span>
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
          </div>
        </section>
      }
    }

    <div class="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <aside class="card h-fit bg-base-100">
        <div class="card-body gap-3 p-4">
          <div class="flex items-center justify-between">
            <h2 class="type-heading">Articles</h2>
            <span class="badge badge-ghost">{{ posts().length }}</span>
          </div>
          <input
            type="search"
            class="input input-bordered input-sm"
            placeholder="Search articles"
            [value]="searchQuery()"
            (input)="searchQuery.set($any($event.target).value)"
          />
          <div class="max-h-[65vh] space-y-2 overflow-y-auto">
            @for (post of filteredPosts(); track post.post_id) {
              <button
                type="button"
                class="w-full rounded-field border p-3 text-left hover:border-primary/50"
                [class.border-primary]="selected()?.post_id === post.post_id"
                [class.bg-primary/5]="selected()?.post_id === post.post_id"
                (click)="selectPost(post)"
              >
                <div class="flex items-start justify-between gap-2">
                  <strong class="line-clamp-2 text-sm">{{
                    post.title || 'Untitled article'
                  }}</strong>
                  <span
                    class="badge badge-sm"
                    [class.badge-success]="post.publication_state === 'published'"
                    [class.badge-warning]="post.publication_state === 'scheduled'"
                    >{{ post.publication_state }}</span
                  >
                </div>
                <p class="type-caption mt-1 truncate">/{{ post.slug }}</p>
              </button>
            } @empty {
              <p class="py-8 text-center type-caption">No articles yet.</p>
            }
          </div>
        </div>
      </aside>

      <section class="card bg-base-100">
        <form class="card-body gap-5 p-4 sm:p-6" (submit)="$event.preventDefault(); save()">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="type-heading">{{ selected() ? 'Edit article' : 'New article' }}</h2>
              <p class="type-caption">
                Published revisions remain immutable; saving creates or updates the next draft.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              @if (selected()?.publication_state === 'scheduled') {
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  [disabled]="busy()"
                  (click)="cancelSchedule()"
                >
                  Cancel schedule
                </button>
              }
              @if (selected()?.publication_state === 'published') {
                <button
                  type="button"
                  class="btn btn-outline btn-error btn-sm"
                  [disabled]="busy()"
                  (click)="archive()"
                >
                  Archive
                </button>
              }
              <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy() || invalid()">
                {{ busy() ? 'Saving…' : 'Save draft' }}
              </button>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="form-control md:col-span-2"
              ><span class="label-text">Title</span
              ><input
                class="input input-bordered"
                maxlength="120"
                [formControl]="title"
                (input)="titleChanged()"
            /></label>
            <label class="form-control"
              ><span class="label-text">Slug</span
              ><input
                class="input input-bordered"
                maxlength="100"
                [formControl]="slug"
                (input)="slugEdited.set(true)"
            /></label>
            <label class="form-control"
              ><span class="label-text">Author</span
              ><input class="input input-bordered" maxlength="120" [formControl]="author"
            /></label>
            <label class="form-control md:col-span-2"
              ><span class="label-text">Excerpt</span
              ><textarea
                class="textarea textarea-bordered"
                rows="2"
                maxlength="320"
                [formControl]="excerpt"
              ></textarea>
            </label>
            <label class="form-control"
              ><span class="label-text">Tags</span
              ><input
                class="input input-bordered"
                placeholder="stock, cash-flow"
                [formControl]="tags"
            /></label>
            <label class="form-control"
              ><span class="label-text">Schedule (Nairobi time)</span
              ><input
                type="datetime-local"
                class="input input-bordered"
                [formControl]="scheduledFor"
            /></label>
            <label class="form-control"
              ><span class="label-text">SEO title</span
              ><input class="input input-bordered" maxlength="70" [formControl]="seoTitle"
            /></label>
            <label class="form-control"
              ><span class="label-text">SEO description</span
              ><input class="input input-bordered" maxlength="180" [formControl]="seoDescription"
            /></label>
            <label class="form-control md:col-span-2"
              ><span class="label-text">Cover image alt text</span
              ><input class="input input-bordered" maxlength="200" [formControl]="coverAlt"
            /></label>
            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <input
                #coverInput
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="file-input file-input-bordered file-input-sm"
                [disabled]="!selected() || busy()"
                (change)="uploadCover($event)"
              />
              @if (!selected()) {
                <span class="type-caption">Save once before uploading a cover.</span>
              }
              @if (coverUrl(); as image) {
                <img [src]="image" [alt]="coverAlt.value" class="h-16 w-28 rounded object-cover" />
              }
            </div>
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <label class="form-control"
              ><span class="label-text">Markdown</span
              ><textarea
                class="textarea textarea-bordered min-h-[28rem] font-mono text-sm"
                [formControl]="markdown"
                (input)="updatePreview()"
              ></textarea>
            </label>
            <div>
              <span class="label-text">Preview</span>
              <article
                class="blog-preview min-h-[28rem] rounded-box border border-base-300 p-5"
                [innerHTML]="preview()"
              ></article>
            </div>
          </div>

          @if (selected()) {
            <div class="flex flex-wrap items-end gap-3 border-t border-base-300 pt-4">
              <button
                type="button"
                class="btn btn-success"
                [disabled]="busy() || selected()?.publication_state !== 'draft' || editorDirty()"
                (click)="publish()"
              >
                Publish draft now
              </button>
              <button
                type="button"
                class="btn btn-outline"
                [disabled]="
                  busy() ||
                  selected()?.publication_state !== 'draft' ||
                  !scheduledFor.value ||
                  editorDirty()
                "
                (click)="schedule()"
              >
                Schedule draft
              </button>
              @if (editorDirty()) {
                <span class="type-caption text-warning"
                  >Save the latest edits before publishing or scheduling.</span
                >
              }
            </div>
          }
        </form>
      </section>
    </div>

    @if (deployments().length) {
      <section class="card mt-4 bg-base-100">
        <div class="card-body p-4">
          <h2 class="type-heading">SEO deployments</h2>
          <div class="mt-2 divide-y divide-base-200">
            @for (deployment of deployments(); track deployment.id) {
              <div class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{{ deployment.created_at | date: 'd MMM y, HH:mm' }}</span
                ><span
                  class="badge"
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
      </section>
    }
  `,
  styles: `
    :host ::ng-deep .blog-preview h1,
    :host ::ng-deep .blog-preview h2,
    :host ::ng-deep .blog-preview h3 {
      margin: 1.25rem 0 0.5rem;
      font-weight: 750;
    }
    :host ::ng-deep .blog-preview h1 {
      font-size: 1.75rem;
    }
    :host ::ng-deep .blog-preview h2 {
      font-size: 1.35rem;
    }
    :host ::ng-deep .blog-preview p {
      margin-bottom: 0.9rem;
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
  `,
})
export class BlogComponent implements OnInit {
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
    this.scheduledFor.setValue('');
    this.coverPath.set(null);
    this.coverUrl.set(null);
    this.slugEdited.set(false);
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
      this.notice.set('Article published; SEO rebuild queued');
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
      this.notice.set('Article archived; SEO rebuild queued');
      await this.load();
      this.newPost();
    });
  }

  protected async uploadCover(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    const id = this.selected()?.post_id;
    if (!file || !id) return;
    if (
      file.size > 5 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      this.error.set('Use a JPEG, PNG, or WebP image up to 5 MB.');
      return;
    }
    await this.run(async () => {
      const path = await this.platform.uploadBlogCover(id, file);
      this.coverPath.set(path);
      this.coverUrl.set(this.platform.blogCoverUrl(path));
      this.coverChanged.set(true);
      this.notice.set('Cover uploaded; save the draft to attach it.');
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

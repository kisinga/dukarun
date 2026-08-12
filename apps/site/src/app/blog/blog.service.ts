import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import {
  Injectable,
  PLATFORM_ID,
  PendingTasks,
  TransferState,
  inject,
  makeStateKey,
} from '@angular/core';
import { environment } from '../../environments/environment';
import { FIXTURE_BLOG_POSTS } from '../core/public-content.fixture';
import { PublicSupabaseService } from '../core/public-supabase.service';

export interface BlogPostSummary {
  post_id: string;
  slug: string;
  title: string;
  excerpt: string;
  author_name: string;
  cover_image_path: string | null;
  cover_image_alt: string | null;
  tags: string[];
  seo_title: string;
  seo_description: string;
  published_at: string;
  reading_minutes: number;
}

export interface PublishedBlogPost extends BlogPostSummary {
  revision_id: string;
  content_markdown: string;
  updated_at: string;
}

export type BlogEventType =
  'post_view' | 'engaged_10s' | 'scroll_50' | 'scroll_90' | 'cta_click' | 'share_click';

const listKey = makeStateKey<BlogPostSummary[]>('site:blog:list');
const featuredKey = makeStateKey<BlogPostSummary | null>('site:blog:featured');
const postKey = (slug: string) => makeStateKey<PublishedBlogPost | null>(`site:blog:${slug}`);

@Injectable({ providedIn: 'root' })
export class BlogService {
  private readonly supabase = inject(PublicSupabaseService);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly transferState = inject(TransferState);
  private readonly platformId = inject(PLATFORM_ID);
  private transientVisitorId: string | null = null;

  async posts(force = false, before?: string, beforeId?: string): Promise<BlogPostSummary[]> {
    if (!before && !force && this.transferState.hasKey(listKey))
      return this.transferState.get(listKey, []);
    const posts =
      environment.publicDataMode === 'fixture'
        ? before
          ? []
          : FIXTURE_BLOG_POSTS
        : await this.track(async () => {
            const { data, error } = await this.supabase.client.rpc('public_blog_posts', {
              p_limit: 24,
              ...(before ? { p_before: before, p_before_id: beforeId } : {}),
            });
            if (error) throw error;
            return (data ?? []) as unknown as BlogPostSummary[];
          });
    if (!before && isPlatformServer(this.platformId)) this.transferState.set(listKey, posts);
    return posts;
  }

  async post(slug: string, force = false): Promise<PublishedBlogPost | null> {
    const key = postKey(slug);
    if (!force && this.transferState.hasKey(key)) return this.transferState.get(key, null);
    const post =
      environment.publicDataMode === 'fixture'
        ? ((FIXTURE_BLOG_POSTS.find(item => item.slug === slug) as PublishedBlogPost | undefined) ??
          null)
        : await this.track(async () => {
            const { data, error } = await this.supabase.client.rpc('public_blog_post', {
              p_slug: slug,
            });
            if (error) throw error;
            return data as unknown as PublishedBlogPost | null;
          });
    if (isPlatformServer(this.platformId)) this.transferState.set(key, post);
    return post;
  }

  async featuredPost(force = false): Promise<BlogPostSummary | null> {
    if (!force && this.transferState.hasKey(featuredKey))
      return this.transferState.get(featuredKey, null);
    const post =
      environment.publicDataMode === 'fixture'
        ? (FIXTURE_BLOG_POSTS[0] ?? null)
        : await this.track(async () => {
            const { data, error } = await this.supabase.client.rpc('public_featured_blog_post');
            if (error) throw error;
            return data as unknown as BlogPostSummary | null;
          });
    if (isPlatformServer(this.platformId)) this.transferState.set(featuredKey, post);
    return post;
  }

  coverUrl(path: string | null): string | null {
    if (!path) return null;
    return this.supabase.client.storage.from('blog-media').getPublicUrl(path).data.publicUrl;
  }

  newEventId(): string {
    return crypto.randomUUID();
  }

  async recordEvent(
    postId: string,
    eventType: BlogEventType,
    metadata: Record<string, string> = {},
    eventId = this.newEventId(),
    keepalive = false
  ): Promise<string> {
    if (!isPlatformBrowser(this.platformId) || environment.publicDataMode === 'fixture')
      return eventId;
    const visitorId = this.visitorId();
    if (keepalive) {
      const response = await fetch(`${environment.supabaseUrl}/rest/v1/rpc/record_blog_event`, {
        method: 'POST',
        headers: {
          apikey: environment.supabaseAnonKey,
          Authorization: `Bearer ${environment.supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_event_id: eventId,
          p_post_id: postId,
          p_visitor_id: visitorId,
          p_event_type: eventType,
          p_metadata: metadata,
        }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(`blog_event_${response.status}`);
      return eventId;
    }
    const { error } = await this.supabase.client.rpc('record_blog_event', {
      p_event_id: eventId,
      p_post_id: postId,
      p_visitor_id: visitorId,
      p_event_type: eventType,
      p_metadata: metadata,
    });
    if (error) throw error;
    return eventId;
  }

  private visitorId(): string {
    const key = 'dukarun-blog-visitor';
    try {
      const existing = localStorage.getItem(key);
      if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
      const created = crypto.randomUUID();
      localStorage.setItem(key, created);
      return created;
    } catch {
      this.transientVisitorId ??= crypto.randomUUID();
      return this.transientVisitorId;
    }
  }

  private track<T>(task: () => Promise<T>): Promise<T> {
    const done = this.pendingTasks.add();
    return task().finally(done);
  }
}

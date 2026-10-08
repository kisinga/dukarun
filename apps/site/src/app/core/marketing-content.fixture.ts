// Fixture-mode review uses the editorial package directly; drafts are never published here.
import editorial from '../../../../../docs/marketing/blog-content.json' with { type: 'json' };
import type { PublishedBlogPost } from '../blog/blog.service';

export const MARKETING_CONTENT_PREVIEW: PublishedBlogPost[] = editorial.posts.map(
  ({ draft, publishedAt }, index) => ({
    post_id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
    revision_id: `00000000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`,
    slug: draft.slug,
    title: draft.title,
    excerpt: draft.excerpt,
    content_markdown: draft.markdown,
    author_name: draft.authorName,
    cover_image_path: null,
    cover_image_alt: null,
    tags: draft.tags,
    seo_title: draft.seoTitle,
    seo_description: draft.seoDescription,
    published_at: publishedAt || `${editorial.preparedAt}T00:00:00Z`,
    updated_at: `${editorial.preparedAt}T00:00:00Z`,
    reading_minutes: Math.max(3, Math.round(draft.markdown.split(/\s+/).length / 200)),
  })
);

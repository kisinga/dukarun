import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { renderSafeMarkdown as browserMarkdown } from '../../packages/legal-markdown.ts';
import {
  renderBlogArticle,
  renderSafeMarkdown,
} from '../../supabase/functions/_shared/public-content-renderer.ts';
import { MARKETING_CONTENT_PREVIEW } from '../../apps/site/src/app/core/marketing-content.fixture.ts';

const { posts } = JSON.parse(
  readFileSync(new URL('../../docs/marketing/blog-content.json', import.meta.url), 'utf8')
);
test('editorial package preserves existing publication history and includes two unpublished guides', () => {
  assert.equal(posts.filter(post => post.operation === 'update').length, 6);
  assert.equal(posts.filter(post => post.operation === 'create').length, 2);
  assert.equal(new Set(posts.map(post => post.draft.slug)).size, 8);
  for (const post of posts) {
    assert.equal(Boolean(post.publishedAt), post.operation === 'update');
    assert.ok(post.draft.authorName);
    assert.ok(post.draft.seoTitle && post.draft.seoDescription);
    assert.doesNotMatch(
      post.draft.markdown,
      /\[Start your free trial\]|does not currently initiate a customer STK Push/
    );
  }
});
test('browser and crawler render the same meaningful article bodies and acquisition destinations', () => {
  for (const { draft, publishedAt } of posts) {
    const preview = MARKETING_CONTENT_PREVIEW.find(post => post.slug === draft.slug);
    const browser = browserMarkdown(draft.markdown).html;
    const contentOnly = html => html.replace(/\s+(?:id|target|rel)="[^"]*"/g, '');
    assert.ok(
      renderSafeMarkdown(draft.markdown) === contentOnly(browser),
      `${draft.slug}: browser/crawler content differs`
    );
    const crawler = renderBlogArticle(
      { ...preview, published_at: publishedAt || preview.published_at },
      'https://dukarun.com',
      'https://dukarun.com/assets/og/dukarun-social.webp'
    );
    assert.ok(crawler.includes(contentOnly(browser)), `${draft.slug}: complete article body`);
    assert.match(crawler, /Request a demo/);
    assert.match(crawler, /contact\?intent=demo&amp;from=%2Fblog%2F/);
    assert.match(crawler, /Ready to start myself/);
    assert.ok(crawler.includes(`https://dukarun.com/blog/${draft.slug}`));
    for (const [, alt, path] of draft.markdown.matchAll(/!\[([^\]]+)\]\((\/assets\/[^)]+)\)/g)) {
      assert.ok(alt.trim());
      assert.ok(existsSync(new URL(`../../apps/site/public${path}`, import.meta.url)), path);
    }
  }
});

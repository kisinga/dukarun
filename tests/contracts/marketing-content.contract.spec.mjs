import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { renderSafeMarkdown as browserMarkdown } from '../../packages/legal-markdown.ts';
import {
  renderBlogArticle,
  renderSafeMarkdown,
} from '../../supabase/functions/_shared/public-content-renderer.ts';
import { FIXTURE_BLOG_POSTS } from '../../apps/site/src/app/core/public-content.fixture.ts';

test('browser and crawler render the same meaningful article bodies and acquisition destinations', () => {
  for (const post of FIXTURE_BLOG_POSTS) {
    const browser = browserMarkdown(post.content_markdown).html;
    const contentOnly = html => html.replace(/\s+(?:id|target|rel)="[^"]*"/g, '');
    assert.ok(
      renderSafeMarkdown(post.content_markdown) === contentOnly(browser),
      `${post.slug}: browser/crawler content differs`
    );
    const crawler = renderBlogArticle(
      post,
      'https://dukarun.com',
      'https://dukarun.com/assets/og/dukarun-social.webp'
    );
    assert.ok(crawler.includes(contentOnly(browser)), `${post.slug}: complete article body`);
    assert.match(crawler, /Request a demo/);
    assert.match(crawler, /contact\?intent=demo&amp;from=%2Fblog%2F/);
    assert.match(crawler, /Ready to start myself/);
    assert.ok(crawler.includes(`https://dukarun.com/blog/${post.slug}`));
    for (const [, alt, path] of post.content_markdown.matchAll(
      /!\[([^\]]+)\]\((\/assets\/[^)]+)\)/g
    )) {
      assert.ok(alt.trim());
      assert.ok(existsSync(new URL(`../../apps/site/public${path}`, import.meta.url)), path);
    }
  }
});

import { describe, expect, it } from 'vitest';
import {
  LEARNING_CONTENT_KEYS,
  LEARNING_CONTENT_REGISTRY,
  gitBookPathForTopic,
} from './learning-content';
import { sanitizeLearningUrl } from './learning-url';

describe('learning content registry', () => {
  it('has one complete definition for every stable key', () => {
    expect(new Set(LEARNING_CONTENT_KEYS).size).toBe(10);
    for (const key of LEARNING_CONTENT_KEYS) {
      const definition = LEARNING_CONTENT_REGISTRY[key];
      expect(definition.key).toBe(key);
      expect(definition.gitbookPath).toMatch(/^\//);
      expect(definition.destinationRoute).toMatch(/^\//);
      expect(definition.permissions.length).toBeGreaterThan(0);
    }
  });

  it('resolves only canonical topic routes', () => {
    expect(gitBookPathForTopic('creating-a-product')).toBe('/products/creating-a-product');
    expect(gitBookPathForTopic('first-business-cycle')).toBe('/journeys/first-business-cycle');
    expect(gitBookPathForTopic('unknown')).toBeNull();
  });
});

describe('learning URL sanitation', () => {
  it('strips query, fragment, and UUID route segments', () => {
    expect(
      sanitizeLearningUrl(
        '/customers/123e4567-e89b-42d3-a456-426614174000?customer=private#credit',
        'https://app.dukarun.com'
      )
    ).toBe('https://app.dukarun.com/customers/:id');
  });
});

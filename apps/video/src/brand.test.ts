import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND } from './brand';
import { repoRoot } from './node-utils';

describe('shared brand contract', () => {
  it('keeps video tokens aligned with the web design system', async () => {
    const webStyles = await readFile(path.join(repoRoot, 'apps/web/src/styles.scss'), 'utf8');
    expect(webStyles).toContain(BRAND.colors.primary);
    expect(webStyles).toContain('Outfit');
    expect(webStyles).toContain('0.75rem');
  });
});

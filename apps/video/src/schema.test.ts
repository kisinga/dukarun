import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shippedClaimIds } from './claims';
import { projectDirectory, readJson } from './node-utils';
import { NarrationModeSchema, VideoBriefSchema, countWords, validateManifest } from './schema';

const projects = [
  ['product-overview', 2645],
  ['sale-records', 637],
  ['credit-communications', 584],
  ['stock-decisions', 656],
  ['guide-product', 720],
  ['guide-supplier', 720],
  ['guide-credit-purchase', 720],
  ['guide-cash-sale', 720],
  ['guide-customer-credit', 720],
  ['guide-credit-sale', 720],
  ['guide-finance-recap', 720],
  ['guide-generate-barcodes', 720],
  ['guide-scan-barcode', 720],
] as const;

const guideProjects = projects.filter(([projectId]) => projectId.startsWith('guide-'));

async function fixtures(projectId: string) {
  const directory = projectDirectory(projectId);
  const brief = VideoBriefSchema.parse(await readJson(path.join(directory, 'brief.json')));
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'script.json'), 'utf8')
  ) as Record<string, unknown>;
  return { brief, manifest };
}

describe('video manifest validation', () => {
  it('supports only local narration modes', () => {
    expect(NarrationModeSchema.options).toEqual(['human', 'mixed', 'silent']);
  });

  it.each(projects)('accepts %s within its duration and word budget', async (projectId, frames) => {
    const { brief, manifest } = await fixtures(projectId);
    const parsed = validateManifest(manifest, shippedClaimIds, brief.targetWordRange);
    const words = countWords(parsed.narration.map(segment => segment.text).join(' '));
    expect(parsed.durationInFrames).toBe(frames);
    expect(words).toBeGreaterThanOrEqual(brief.targetWordRange[0]);
    expect(words).toBeLessThanOrEqual(brief.targetWordRange[1]);
    expect(parsed.scenes.at(-1)!.startFrame + parsed.scenes.at(-1)!.durationInFrames).toBe(frames);
  });

  it('accepts the product overview as the primary introduction', async () => {
    const { brief, manifest } = await fixtures('product-overview');
    const parsed = validateManifest(manifest, shippedClaimIds, brief.targetWordRange);
    expect(parsed.durationInFrames).toBe(2645);
    expect(
      countWords(parsed.narration.map(segment => segment.text).join(' '))
    ).toBeGreaterThanOrEqual(120);
    expect(parsed.scenes.map(scene => scene.template)).toEqual([
      'business-operations',
      'records-breakdown',
      'dukarun-transition',
      'barcode-sale',
      'transaction-flow',
      'remote-dashboard',
      'customer-comms',
      'staff-performance',
      'operations-snapshot',
      'cta',
    ]);
  });

  it('keeps the next guide-video pass on the real-app capture baseline', async () => {
    const [baseline, nextSteps] = await Promise.all([
      readFile(path.join(import.meta.dirname, '..', 'GUIDE_DESIGN_LANGUAGE.md'), 'utf8'),
      readFile(
        path.join(
          import.meta.dirname,
          '..',
          '..',
          '..',
          'docs',
          'learning-platform',
          'NEXT_STEPS.md'
        ),
        'utf8'
      ),
    ]);
    expect(baseline).toContain('The running Dukarun app supplies the interface and interactions.');
    expect(baseline).toContain('Do not rebuild Dukarun screens in Remotion');
    expect(baseline).toContain('wide, vertical, and square viewports');
    expect(baseline).toContain('Use light mode for the full guide set');
    expect(baseline).toContain('Never use static percentages.');
    expect(baseline).toContain('Approve **Creating a product** in all three formats');
    expect(nextSteps).toContain('Use **Creating a product** as the pilot.');
    expect(nextSteps).toContain('Do not crop the wide recording into');
    expect(nextSteps).toContain('Do not merge a reconstructed Dukarun interface');
  });

  it('does not ship the rejected reconstructed learning interface', async () => {
    const sources = await Promise.all(
      ['schema.ts', 'scenes.tsx', 'styles.css'].map(file =>
        readFile(path.join(import.meta.dirname, file), 'utf8')
      )
    );
    expect(sources.join('\n')).not.toMatch(/GuideAppScene|guide-app|guide-scene/);
  });

  it.each(guideProjects)('keeps %s guide copy free of em dashes', async projectId => {
    const { brief, manifest } = await fixtures(projectId);
    expect(JSON.stringify({ brief, manifest })).not.toContain('—');
  });

  it('rejects unsupported marketing claims', async () => {
    const { brief, manifest } = await fixtures('sale-records');
    const changed = structuredClone(manifest) as typeof manifest & {
      scenes: Array<{ claimIds: string[] }>;
    };
    changed.scenes[0].claimIds = ['future-magic'];
    expect(() => validateManifest(changed, shippedClaimIds, brief.targetWordRange)).toThrow(
      'Unsupported claim'
    );
  });

  it('rejects duplicate scene IDs', async () => {
    const { brief, manifest } = await fixtures('sale-records');
    const changed = structuredClone(manifest) as typeof manifest & {
      scenes: Array<{ id: string }>;
    };
    changed.scenes[1].id = changed.scenes[0].id;
    expect(() => validateManifest(changed, shippedClaimIds, brief.targetWordRange)).toThrow(
      'Duplicate scene id'
    );
  });
});

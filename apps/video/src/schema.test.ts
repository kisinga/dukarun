import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shippedClaimIds } from './claims';
import { projectDirectory, readJson } from './node-utils';
import { NarrationModeSchema, VideoBriefSchema, countWords, validateManifest } from './schema';

const projects = [
  ['product-overview', 2614],
  ['sale-records', 626],
  ['credit-communications', 584],
  ['stock-decisions', 656],
] as const;

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
    expect(parsed.durationInFrames).toBe(2614);
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

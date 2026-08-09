import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shippedClaimIds } from './claims';
import { projectDirectory, readJson } from './node-utils';
import { NarrationModeSchema, VideoBriefSchema, countWords, validateManifest } from './schema';

async function fixtures() {
  const directory = projectDirectory('offline-pos');
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

  it('accepts the checked-in pilot within its word budget', async () => {
    const { brief, manifest } = await fixtures();
    const parsed = validateManifest(manifest, shippedClaimIds, brief.targetWordRange);
    expect(parsed.durationInFrames).toBe(1800);
    expect(
      countWords(parsed.narration.map(segment => segment.text).join(' '))
    ).toBeGreaterThanOrEqual(100);
  });

  it('keeps audio references under the ignored media boundary', async () => {
    const { brief, manifest } = await fixtures();
    const parsed = validateManifest(manifest, shippedClaimIds, brief.targetWordRange);
    const audioFiles = parsed.narration.flatMap(segment =>
      segment.audioFile ? [segment.audioFile] : []
    );
    expect(audioFiles.length).toBeGreaterThan(0);
    for (const audioFile of audioFiles) {
      expect(audioFile).toMatch(/^media\//u);
    }
  });

  it('rejects unsupported marketing claims', async () => {
    const { brief, manifest } = await fixtures();
    const changed = structuredClone(manifest) as typeof manifest & {
      scenes: Array<{ claimIds: string[] }>;
    };
    changed.scenes[0].claimIds = ['future-magic'];
    expect(() => validateManifest(changed, shippedClaimIds, brief.targetWordRange)).toThrow(
      'Unsupported claim'
    );
  });

  it('rejects duplicate scene IDs', async () => {
    const { brief, manifest } = await fixtures();
    const changed = structuredClone(manifest) as typeof manifest & {
      scenes: Array<{ id: string }>;
    };
    changed.scenes[1].id = changed.scenes[0].id;
    expect(() => validateManifest(changed, shippedClaimIds, brief.targetWordRange)).toThrow(
      'Duplicate scene id'
    );
  });
});

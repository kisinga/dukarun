import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDirectory } from './node-utils';
import { ScriptManifestSchema } from './schema';
import { durationFor, timelineFor, type Cutdown } from './timeline';

async function manifestFixture() {
  return ScriptManifestSchema.parse(
    JSON.parse(await readFile(path.join(projectDirectory('offline-pos'), 'script.json'), 'utf8'))
  );
}

describe('cutdown timelines', () => {
  it.each<Cutdown>(['offline', 'ledger', 'dashboard'])(
    '%s is exactly 15 seconds and sequential',
    async cutdown => {
      const manifest = await manifestFixture();
      const timeline = timelineFor(manifest, cutdown);
      expect(durationFor(cutdown, manifest)).toBe(450);
      expect(timeline.at(-1)!.startFrame + timeline.at(-1)!.durationInFrames).toBe(450);
      timeline.slice(1).forEach((scene, index) => {
        const previous = timeline[index];
        expect(scene.startFrame).toBe(previous.startFrame + previous.durationInFrames);
      });
    }
  );
});

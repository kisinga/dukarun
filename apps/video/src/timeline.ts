import type { Scene, ScriptManifest } from './schema';

export type Cutdown = 'full' | 'offline' | 'ledger' | 'dashboard';

const CUTDOWN_SCENES: Record<Exclude<Cutdown, 'full'>, readonly string[]> = {
  offline: ['sell', 'queue', 'sync'],
  ledger: ['receipt', 'ledger', 'cta'],
  dashboard: ['dashboard', 'cta'],
};

export function timelineFor(manifest: ScriptManifest, cutdown: Cutdown): Scene[] {
  if (cutdown === 'full') return manifest.scenes;

  const selected = CUTDOWN_SCENES[cutdown]
    .map(id => manifest.scenes.find(scene => scene.id === id))
    .filter((scene): scene is Scene => Boolean(scene));

  if (selected.length === 0) throw new Error(`No scenes configured for ${cutdown}`);

  const targetFrames = 450;
  const sourceFrames = selected.reduce((sum, scene) => sum + scene.durationInFrames, 0);
  let cursor = 0;

  return selected.map((scene, index) => {
    const isLast = index === selected.length - 1;
    const durationInFrames = isLast
      ? targetFrames - cursor
      : Math.max(30, Math.round((scene.durationInFrames / sourceFrames) * targetFrames));
    const mapped = { ...scene, startFrame: cursor, durationInFrames };
    cursor += durationInFrames;
    return mapped;
  });
}

export function durationFor(cutdown: Cutdown, manifest: ScriptManifest): number {
  return cutdown === 'full' ? manifest.durationInFrames : 450;
}

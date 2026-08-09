import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { videoRoot } from '../src/node-utils';
import type { RenderTarget } from '../src/schema';
import type { Cutdown } from '../src/timeline';

const targets: RenderTarget[] = ['wide', 'vertical', 'square'];
const endings: Array<{ cutdown: Cutdown; frame: number }> = [
  { cutdown: 'full', frame: 1770 },
  { cutdown: 'ledger', frame: 420 },
  { cutdown: 'dashboard', frame: 410 },
];

const outputDirectory = path.join(videoRoot, '.cache', 'cta-validation');
await mkdir(outputDirectory, { recursive: true });

const serveUrl = await bundle({
  entryPoint: path.join(videoRoot, 'src', 'index.ts'),
  publicDir: path.join(videoRoot, 'public'),
});

for (const ending of endings) {
  for (const target of targets) {
    const id = `offline-pos-${ending.cutdown}-${target}`;
    const composition = await selectComposition({ serveUrl, id });
    const output = path.join(outputDirectory, `${id}.png`);
    await renderStill({
      serveUrl,
      composition,
      frame: ending.frame,
      imageFormat: 'png',
      output,
      overwrite: true,
      logLevel: 'warn',
    });
    console.log(output);
  }
}

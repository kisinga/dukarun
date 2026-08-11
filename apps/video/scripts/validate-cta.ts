import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { videoRoot } from '../src/node-utils';
import type { RenderTarget } from '../src/schema';

const targets: RenderTarget[] = ['wide', 'vertical', 'square'];
const endings: Array<{ projectId: string; frame: number }> = [
  { projectId: 'product-overview', frame: 2400 },
  { projectId: 'sale-records', frame: 570 },
  { projectId: 'credit-communications', frame: 570 },
  { projectId: 'stock-decisions', frame: 570 },
];

const outputDirectory = path.join(videoRoot, '.cache', 'cta-validation');
await mkdir(outputDirectory, { recursive: true });

const serveUrl = await bundle({
  entryPoint: path.join(videoRoot, 'src', 'index.ts'),
  publicDir: path.join(videoRoot, 'public'),
});

for (const ending of endings) {
  for (const target of targets) {
    const id = `${ending.projectId}-full-${target}`;
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

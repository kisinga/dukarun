import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { videoRoot } from '../src/node-utils';
import type { RenderTarget } from '../src/schema';

const targets: RenderTarget[] = ['wide', 'vertical', 'square'];
const frames = [105, 386, 600, 790, 1016, 1295, 1637, 1912, 2181, 2485];
const outputDirectory = path.join(videoRoot, '.cache', 'overview-validation');
await mkdir(outputDirectory, { recursive: true });

const serveUrl = await bundle({
  entryPoint: path.join(videoRoot, 'src', 'index.ts'),
  publicDir: path.join(videoRoot, 'public'),
});

for (const target of targets) {
  const id = `product-overview-full-${target}`;
  const composition = await selectComposition({ serveUrl, id });
  for (const frame of frames) {
    const output = path.join(outputDirectory, `${id}-${frame}.png`);
    await renderStill({
      serveUrl,
      composition,
      frame,
      imageFormat: 'png',
      output,
      overwrite: true,
      logLevel: 'warn',
    });
    console.log(output);
  }
}

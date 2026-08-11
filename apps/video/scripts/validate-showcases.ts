import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { videoRoot } from '../src/node-utils';
import type { RenderTarget } from '../src/schema';

const targets: RenderTarget[] = ['wide', 'vertical', 'square'];
const projects = ['sale-records', 'credit-communications', 'stock-decisions'] as const;
const frames = [75, 240, 420, 570];
const outputDirectory = path.join(videoRoot, '.cache', 'showcase-validation');
await mkdir(outputDirectory, { recursive: true });

const serveUrl = await bundle({
  entryPoint: path.join(videoRoot, 'src', 'index.ts'),
  publicDir: path.join(videoRoot, 'public'),
});

for (const projectId of projects) {
  for (const target of targets) {
    const id = `${projectId}-full-${target}`;
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
}

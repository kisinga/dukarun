import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}supabase/functions/_shared/generated`, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['packages/documents/pdf-edge.ts'],
  outfile: 'supabase/functions/_shared/generated/documents.mjs',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  loader: { '.ttf': 'binary', '.wasm': 'binary' },
  minify: true,
  legalComments: 'eof',
});

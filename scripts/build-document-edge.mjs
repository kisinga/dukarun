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
  // Edge runtime v1.71.2 exposes truncated Math constants (notably LN2 = 0).
  // Inline the standard values for the renderer and its bundled dependencies;
  // fontkit otherwise divides by zero while writing subset font headers.
  define: {
    'Math.E': '2.718281828459045',
    'Math.LN2': '0.6931471805599453',
    'Math.LN10': '2.302585092994046',
    'Math.LOG2E': '1.4426950408889634',
    'Math.LOG10E': '0.4342944819032518',
    'Math.PI': '3.141592653589793',
    'Math.SQRT2': '1.4142135623730951',
    'Math.SQRT1_2': '0.7071067811865476',
  },
  minify: true,
  legalComments: 'eof',
});

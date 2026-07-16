import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'boundary-check.mjs');
const tsconfigPath = path.join(__dirname, 'boundary-check.fixtures', 'tsconfig.json');
const appDir = path.join(__dirname, 'boundary-check.fixtures', 'app');

const expected = [
  'shared -> domain',
  'shared -> page',
  'non-page/non-component imports component alias',
  'domain self-import',
  'domain -> page',
  'domain -> shell',
  'page -> other page',
];

const child = spawn('node', [script, tsconfigPath, appDir], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (data) => {
  output += data.toString();
});
child.stderr.on('data', (data) => {
  output += data.toString();
});

child.on('close', (code) => {
  if (code === 0) {
    console.error('Expected boundary violations but check passed.\n');
    process.exit(1);
  }

  const missing = expected.filter((snippet) => !output.includes(snippet));
  if (missing.length > 0) {
    console.error('Missing expected violations:', missing.join(', '));
    console.error(output);
    process.exit(1);
  }

  console.log('boundary-check fixture tests passed');
});

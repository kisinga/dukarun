import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const dockerfile = readFileSync(resolve(root, 'apps/Dockerfile'), 'utf8');
// These source COPYs feed the Angular builder; the nginx stage only consumes its output.
const builder = dockerfile.split('FROM nginx:')[0];

for (const app of ['site', 'web', 'storefront', 'super-admin']) {
  test(`${app} source aliases resolve inside the Docker builder, not just the checkout`, () => {
    const copies = [...builder.matchAll(/^COPY (?!.*--from=)(.+)$/gm)].flatMap(match => {
      const paths = match[1].replaceAll('$APP', app).trim().split(/\s+/);
      const destination = paths.pop();
      return paths.map(source => ({ source, destination }));
    });
    const configFile = resolve(root, 'apps', app, 'tsconfig.json');
    const { config, error } = ts.readConfigFile(configFile, ts.sys.readFile);
    assert.equal(error, undefined);
    const base = resolve(root, 'apps', app, config.compilerOptions.baseUrl ?? '.');
    for (const [alias, targets] of Object.entries(config.compilerOptions.paths)) {
      for (const target of targets) {
        const file = resolve(base, target);
        assert.ok(existsSync(file), `${alias}: source is missing: ${file}`);
        const included = copies.some(({ source, destination }) => {
          const input = resolve(root, source);
          if (!existsSync(input)) return false;
          const output = resolve(root, destination);
          if (statSync(input).isFile()) {
            return file === (destination.endsWith('/') ? resolve(output, source) : output);
          }
          const suffix = relative(output, file);
          return !suffix.startsWith('..') && existsSync(resolve(input, suffix));
        });
        assert.ok(
          included,
          `${app}: ${alias} (${relative(root, file)}) is missing from apps/Dockerfile COPY inputs`
        );
      }
    }
  });
}

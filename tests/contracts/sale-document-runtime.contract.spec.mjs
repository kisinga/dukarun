import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { configureDocumentRuntime } from '../../scripts/configure-document-runtime.mjs';
import { withSaleDocumentCpuBudget } from '../../supabase/functions/_shared/sale-document-runtime.ts';

const router = `
// A host-specific authentication check must survive configuration.
export async function route(servicePath: string, authorized: boolean) {
  if (!authorized) throw new Error('not_authorized');
  const options = { legacy: true };
  return await EdgeRuntime.userWorkers.create({
    servicePath, memoryLimitMb: 150, workerTimeoutMs: 60000,
    noModuleCache: false, envVars: [['EXAMPLE', 'fixture']],
    cpuTimeSoftLimitMs: 1000, cpuTimeHardLimitMs: 2000,
    ...options,
  });
}
`;

test('configuring the existing router preserves authentication and unrelated worker options', async () => {
  const configured = configureDocumentRuntime(router);
  assert.equal(
    configureDocumentRuntime(configured),
    configured,
    'configuration must be idempotent'
  );
  const created = [];
  const context = {
    exports: {},
    require: name => {
      assert.equal(name, '../_shared/sale-document-runtime.ts');
      return { withSaleDocumentCpuBudget };
    },
    EdgeRuntime: {
      userWorkers: {
        create: async options => {
          created.push(options);
          return options;
        },
      },
    },
  };
  const compiled = ts.transpileModule(configured, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(compiled.outputText, context);
  await assert.rejects(
    context.exports.route('/functions/sale-document-send', false),
    /not_authorized/
  );
  assert.equal(created.length, 0);
  for (const name of ['sale-document-send', 'notification-flush', 'paystack-webhook']) {
    const result = await context.exports.route(`/functions/${name}`, true);
    const pdf = name !== 'paystack-webhook';
    assert.equal(result.cpuTimeSoftLimitMs, pdf ? 4000 : 1000);
    assert.equal(result.cpuTimeHardLimitMs, pdf ? 8000 : 2000);
    assert.equal(result.memoryLimitMb, 150);
    assert.equal(result.workerTimeoutMs, 60000);
    assert.equal(result.noModuleCache, false);
    assert.equal(result.envVars[0][1], 'fixture');
    assert.equal(result.legacy, true);
  }
});

test('the policy matches complete function names and preserves defaults for other routes', () => {
  for (const servicePath of [
    '/functions/notification-flush-other',
    '/functions/site-deploy',
    '/sale-document-send/index.ts',
  ]) {
    const options = { servicePath, memoryLimitMb: 150 };
    assert.equal(withSaleDocumentCpuBudget(options), options);
    assert.equal(Object.hasOwn(options, 'cpuTimeHardLimitMs'), false);
  }
  assert.equal(
    withSaleDocumentCpuBudget({ servicePath: '/functions/sale-document-send/' }).cpuTimeHardLimitMs,
    8000
  );
});

test('unsupported routers fail before a deployment can replace authentication code', () => {
  for (const source of [
    'not valid TypeScript {',
    'Deno.serve(() => new Response("no worker"));',
    router + '\nEdgeRuntime.userWorkers.create({ servicePath: "another" });',
    'EdgeRuntime.userWorkers.create(options);',
    'EdgeRuntime.userWorkers.create(withSaleDocumentCpuBudget({servicePath:"test"}));',
  ])
    assert.throws(() => configureDocumentRuntime(source));
});

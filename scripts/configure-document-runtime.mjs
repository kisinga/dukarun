import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const helper = 'withSaleDocumentCpuBudget';
const policyPath = '../_shared/sale-document-runtime.ts';

/** Preserve the host's JWT/router implementation; change only worker options. */
export function configureDocumentRuntime(source) {
  const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length) throw new Error('Edge main router contains invalid TypeScript');
  const calls = [];
  let helperNames = 0;
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === helper) helperNames++;
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === 'EdgeRuntime.userWorkers.create'
    )
      calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (calls.length !== 1 || calls[0].arguments.length !== 1)
    throw new Error('Expected exactly one EdgeRuntime.userWorkers.create(options) call');
  const argument = calls[0].arguments[0];
  const hasImport = file.statements.some(
    node =>
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === policyPath &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.some(
        binding => binding.name.text === helper && (binding.propertyName?.text ?? helper) === helper
      )
  );
  if (ts.isCallExpression(argument) && argument.expression.getText(file) === helper) {
    if (!hasImport || argument.arguments.length !== 1)
      throw new Error('Existing document runtime policy is incomplete');
    return source;
  }
  if (helperNames || hasImport || !ts.isObjectLiteralExpression(argument))
    throw new Error('Unsupported Edge main router; review worker options before configuring PDFs');
  return (
    `import { ${helper} } from '${policyPath}';\n` +
    source.slice(0, argument.getStart(file)) +
    `${helper}(${argument.getText(file)})` +
    source.slice(argument.end)
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: configure-document-runtime.mjs INPUT OUTPUT');
  writeFileSync(output, configureDocumentRuntime(readFileSync(input, 'utf8')));
}

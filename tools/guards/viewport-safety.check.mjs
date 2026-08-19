#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const APP_ROOTS = ['apps/web/src/app', 'apps/super-admin/src/app'].map(path => resolve(ROOT, path));
const SCANNER_EXCEPTION = resolve(ROOT, 'apps/web/src/app/shared/ui/barcode-scanner.component.ts');
const PROTECTED_CLASS_RE = /(?:^|:)(?:h|min-h|max-h)-|(?:^|:)overflow(?:-|$)|(?:d|s|l)?vh/i;
const PROTECTED_CSS_RE =
  /\b(?:height|min-height|max-height|block-size|min-block-size|max-block-size|overflow|overflow-x|overflow-y)\s*:/i;
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (['.ts', '.html', '.scss', '.css'].includes(extname(path))) yield path;
  }
}

function templateFragments(source, extension) {
  if (extension === '.html') return [{ content: source, offset: 0 }];
  if (extension !== '.ts') return [];

  const fragments = [];
  const startPattern = /\btemplate\s*:\s*`/g;
  for (const match of source.matchAll(startPattern)) {
    const start = match.index + match[0].length;
    let end = start;
    while (end < source.length) {
      if (source[end] === '`' && source[end - 1] !== '\\') break;
      end++;
    }
    fragments.push({ content: source.slice(start, end), offset: start });
    startPattern.lastIndex = end + 1;
  }
  return fragments;
}

function elementTree(content) {
  const root = { name: '#root', attrs: '', start: 0, end: content.length, children: [] };
  const stack = [root];
  let cursor = 0;

  while (cursor < content.length) {
    const start = content.indexOf('<', cursor);
    if (start < 0) break;
    let end = start + 1;
    let quote = null;
    while (end < content.length) {
      const character = content[end];
      if (quote) {
        if (character === quote && content[end - 1] !== '\\') quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
      end++;
    }
    if (end >= content.length) break;

    const raw = content.slice(start, end + 1);
    const parsed = raw.match(/^<\s*(\/?)\s*([A-Za-z][\w:-]*)\b([\s\S]*?)>$/);
    cursor = end + 1;
    if (!parsed) continue;

    const closing = parsed[1] === '/';
    const name = parsed[2].toLowerCase();
    if (closing) {
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].name !== name) continue;
        stack[index].end = end + 1;
        stack.length = index;
        break;
      }
      continue;
    }

    const parent = stack.at(-1);
    const node = {
      name,
      attrs: parsed[3],
      start,
      end: end + 1,
      parent,
      children: [],
    };
    parent.children.push(node);
    if (!raw.endsWith('/>') && !VOID_ELEMENTS.has(name)) stack.push(node);
  }
  return root;
}

function staticClasses(node) {
  const match = node.attrs.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/);
  return new Set((match?.[2] ?? '').split(/\s+/).filter(Boolean));
}

function collect(node, predicate, result = []) {
  if (predicate(node)) result.push(node);
  for (const child of node.children) collect(child, predicate, result);
  return result;
}

function descendantsWithinModal(node, predicate, result = []) {
  for (const child of node.children) {
    if (staticClasses(child).has('modal-box')) continue;
    if (predicate(child)) result.push(child);
    descendantsWithinModal(child, predicate, result);
  }
  return result;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function componentStyleBlocks(source) {
  const blocks = [];
  const pattern = /\bstyles\s*:\s*`/g;
  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length;
    let end = start;
    while (end < source.length) {
      if (source[end] === '`' && source[end - 1] !== '\\') break;
      end++;
    }
    blocks.push(source.slice(start, end));
    pattern.lastIndex = end + 1;
  }
  return blocks.join('\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let failures = 0;
function fail(file, line, message) {
  failures++;
  const location = line ? `${relative(ROOT, file)}:${line}` : relative(ROOT, file);
  console.error(`✖ [viewport-safety] ${location}\n    ${message}`);
}

for (const appRoot of APP_ROOTS) {
  for (const file of files(appRoot)) {
    if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)) continue;
    const extension = extname(file);
    const source = readFileSync(file, 'utf8');

    if (extension === '.scss' || extension === '.css') {
      if (
        !file.endsWith(`${join('src', 'styles.scss')}`) &&
        /\.(?:modal|dialog)[^{]*\{[^}]*\}/gis.test(source)
      ) {
        for (const rule of source.matchAll(/\.(?:modal|dialog)[^{]*\{([^}]*)\}/gis)) {
          if (PROTECTED_CSS_RE.test(rule[1])) {
            fail(
              file,
              lineAt(source, rule.index),
              'Component styles must not own modal sizing or overflow.'
            );
          }
        }
      }
      continue;
    }

    const styleSource = extension === '.ts' ? componentStyleBlocks(source) : '';
    for (const fragment of templateFragments(source, extension)) {
      const root = elementTree(fragment.content);
      const modalContainers = collect(
        root,
        node => node.name === 'dialog' || staticClasses(node).has('modal')
      );
      for (const modal of modalContainers) {
        const boxes = collect(modal, node => staticClasses(node).has('modal-box'));
        if (boxes.length === 0 && file !== SCANNER_EXCEPTION) {
          fail(
            file,
            lineAt(source, fragment.offset + modal.start),
            'Modal containers must use a classified .modal-box; only the shared barcode scanner is exempt.'
          );
        }
      }

      const boxes = collect(root, node => staticClasses(node).has('modal-box'));
      for (const box of boxes) {
        const classes = staticClasses(box);
        const task = classes.has('modal-box-task');
        const scroll = classes.has('modal-box-scroll');
        const line = lineAt(source, fragment.offset + box.start);
        if (task === scroll) {
          fail(
            file,
            line,
            'Every .modal-box must choose exactly one contract: .modal-box-task or .modal-box-scroll.'
          );
          continue;
        }

        for (const className of classes) {
          if (PROTECTED_CLASS_RE.test(className)) {
            fail(
              file,
              line,
              `Modal shell class "${className}" bypasses the shared viewport recipe.`
            );
          }
        }

        if (task) {
          const bodies = descendantsWithinModal(box, node => staticClasses(node).has('modal-body'));
          if (bodies.length !== 1) {
            fail(
              file,
              line,
              `Task modals require exactly one .modal-body; found ${bodies.length}.`
            );
          }
          for (const body of bodies) {
            for (const className of staticClasses(body)) {
              if (PROTECTED_CLASS_RE.test(className)) {
                fail(
                  file,
                  lineAt(source, fragment.offset + body.start),
                  `Modal body class "${className}" bypasses the shared scroll recipe.`
                );
              }
            }
          }
        }

        if (styleSource) {
          const protectedNodes = [box];
          if (task) {
            protectedNodes.push(
              ...descendantsWithinModal(box, node => staticClasses(node).has('modal-body'))
            );
          }
          const customClasses = new Set(
            protectedNodes.flatMap(node =>
              [...staticClasses(node)].filter(className => /^[A-Za-z_][\w-]*$/.test(className))
            )
          );
          for (const className of customClasses) {
            const rulePattern = new RegExp(
              `\\.${escapeRegExp(className)}(?:[^.{][^{]*)?\\{([^}]*)\\}`,
              'g'
            );
            for (const rule of styleSource.matchAll(rulePattern)) {
              if (PROTECTED_CSS_RE.test(rule[1])) {
                fail(
                  file,
                  line,
                  `Component CSS for .${className} must not own modal sizing or overflow.`
                );
              }
            }
          }
        }
      }
    }
  }
}

if (failures > 0) process.exit(1);
console.log('viewport-safety: clean.');

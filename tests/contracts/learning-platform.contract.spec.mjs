import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const contracts = {
  'apps/web/src/app/products/products.component.ts': ['product-add', 'product-print-labels'],
  'apps/web/src/app/products/product-editor.component.ts': [
    'product-name',
    'product-continue-variants',
    'product-save',
  ],
  'apps/web/src/app/products/product-editor-variants.component.ts': [
    'product-selling-price',
    'product-inventory-tracking',
  ],
  'apps/web/src/app/products/barcode-label-dialog.component.ts': [
    'barcode-generate',
    'barcode-generate-confirm',
    'barcode-print',
  ],
  'apps/web/src/app/suppliers/suppliers.component.ts': ['supplier-add'],
  'apps/web/src/app/suppliers/supplier-profile-form.component.ts': [
    'supplier-name',
    'supplier-save',
  ],
  'apps/web/src/app/purchases/purchase-editor.component.ts': [
    'purchase-product-search',
    'purchase-review',
  ],
  'apps/web/src/app/purchases/purchase-line-row.component.ts': [
    'purchase-item-row',
    'purchase-item-quantity',
    'purchase-item-unit-cost',
  ],
  'apps/web/src/app/purchases/purchase-supplier-header.component.ts': [
    'purchase-supplier',
    'purchase-supplier-selected',
    'purchase-location',
  ],
  'apps/web/src/app/purchases/purchase-payment-review.component.ts': [
    'purchase-pay-later',
    'purchase-confirm',
  ],
  'apps/web/src/app/customers/customers.component.ts': [
    'customer-add',
    'customer-save',
    'customer-credit-limit',
    'customer-credit-approved',
    'customer-credit-save',
  ],
  'apps/web/src/app/pos/sell/sell-catalog-panel.component.ts': [
    'sell-product-search',
    'sell-barcode-scan',
  ],
  'apps/web/src/app/pos/sell/sell-payment-actions.component.ts': [
    'sell-checkout',
    'sell-on-credit',
  ],
  'apps/web/src/app/pages/dashboard/dashboard.component.ts': [
    'financial-dashboard',
    'financial-stock',
  ],
  'apps/web/src/app/money/cashier/money-cashier.component.ts': ['financial-cash'],
  'apps/web/src/app/money/credit/money-credit.component.ts': ['financial-credit'],
  'apps/web/src/app/reports/reports.component.ts': ['financial-revenue-margin'],
};

test('interactive learning anchors remain stable', async () => {
  for (const [file, anchors] of Object.entries(contracts)) {
    const source = await readFile(file, 'utf8');
    for (const anchor of anchors) {
      assert.match(
        source,
        new RegExp(`data-learning-anchor=["']${anchor}["']`),
        `${file}: ${anchor}`
      );
    }
  }
});

test('custom business-cycle progress storage and query-driven guide routing stay removed', async () => {
  const files = [
    'apps/web/src/app/app.routes.ts',
    'apps/web/src/app/products/products.component.ts',
    'apps/web/src/app/suppliers/suppliers.component.ts',
    'apps/web/src/app/customers/customers.component.ts',
    'apps/web/src/app/purchases/purchase-editor.component.ts',
    'apps/web/src/app/pos/sell/sell.component.ts',
    'packages/shared-types/database.types.ts',
  ];
  const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /BusinessCycleGuide|user_guide_progress|business_cycle_guide_/);
  assert.doesNotMatch(source, /params\.get\(['"]guide['"]\)/);
});

test('Dukarun Guide exposes Assistant, search, docs, and same-tab guide actions', async () => {
  const source = await readFile('apps/web/src/app/learning/help-embed.component.ts', 'utf8');
  assert.match(source, /tabs: \['assistant', 'search', 'docs'\]/);
  assert.match(source, /this\.router\.navigate\(\['\/learn', actionKey\]\)/);
  assert.doesNotMatch(source, /suggestions: \[\]|tools: \[\]/);
  assert.match(source, /Dukarun Guide needs an internet connection/);
  assert.match(source, /Open in new tab/);
});

test('GitBook import keeps task articles clear, repeatable, and honest about available media', async () => {
  const taskArticles = [
    'products/creating-a-product.md',
    'products/generating-product-barcodes.md',
    'suppliers/creating-a-supplier.md',
    'suppliers/recording-a-supplier-payment.md',
    'purchases/recording-a-credit-purchase.md',
    'selling/making-a-cash-sale.md',
    'selling/selling-by-scanning-a-barcode.md',
    'customers-and-credit/creating-a-customer-with-credit.md',
    'customers-and-credit/receiving-a-customer-payment.md',
    'selling/making-a-credit-sale.md',
    'money-and-reporting/reviewing-credit-health.md',
    'money-and-reporting/reading-sales-costs-and-margin.md',
  ];
  const root = 'docs/learning-platform/gitbook-import';
  const requiredSections = [
    'Why this matters',
    'Before you start',
    'Video',
    'Steps',
    'What changes in Dukarun',
    'Related terms',
    'If something does not look right',
  ];
  const temporaryVideo = '{% embed url="https://youtu.be/dfykDyK6Fs8" %}';

  for (const article of taskArticles) {
    const source = await readFile(`${root}/${article}`, 'utf8');
    for (const section of requiredSections) {
      assert.match(source, new RegExp(`^## ${section}$`, 'm'), `${article}: ${section}`);
    }
    assert.match(source, new RegExp(temporaryVideo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(source, /\/media\/video\/guides\//, `${article}: no unpublished media`);
  }

  const guideBackedArticles = [
    'products/creating-a-product.md',
    'products/generating-product-barcodes.md',
    'suppliers/creating-a-supplier.md',
    'purchases/recording-a-credit-purchase.md',
    'selling/making-a-cash-sale.md',
    'selling/selling-by-scanning-a-barcode.md',
    'customers-and-credit/creating-a-customer-with-credit.md',
    'selling/making-a-credit-sale.md',
  ];
  for (const article of guideBackedArticles) {
    assert.match(await readFile(`${root}/${article}`, 'utf8'), /\/learn\/[a-z-]+\)/, article);
  }

  const recap = await readFile(
    `${root}/money-and-reporting/understanding-the-financial-result.md`,
    'utf8'
  );
  assert.match(recap, /^## Follow one transaction at a time$/m);
  assert.match(recap, /^## Video$/m);
  assert.match(recap, /\{% embed url="https:\/\/youtu\.be\/dfykDyK6Fs8" %\}/);
  assert.match(recap, /Customer payment \| No change \| Increases/);
  assert.match(recap, /Supplier payment \| No change \| Decreases/);
  assert.doesNotMatch(recap, /\/media\/video\/guides\//);
});

test('public learning docs use plain punctuation without em dashes', async () => {
  const root = 'docs/learning-platform/gitbook-import';
  const pending = [root];
  const markdown = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name.endsWith('.md')) markdown.push(path);
    }
  }
  for (const path of markdown) {
    assert.doesNotMatch(await readFile(path, 'utf8'), /—/u, path);
  }
});

test('GitBook import seeds the canonical business glossary and journey', async () => {
  const root = 'docs/learning-platform/gitbook-import';
  const glossary = await readFile(`${root}/glossary.md`, 'utf8');
  for (const term of [
    'Product',
    'Variant',
    'Barcode',
    'Inventory tracking',
    'Stock location',
    'Supplier',
    'Credit purchase',
    'Payable',
    'Customer',
    'Credit limit',
    'Credit sale',
    'Receivable',
    'COGS',
    'Gross margin',
    'Cash received',
    'Revenue',
    'Stock on hand',
    'Unit cost',
    'Payment terms',
    'Downpayment',
  ]) {
    assert.match(glossary, new RegExp(`^## ${term}$`, 'm'), term);
  }

  const journey = await readFile(`${root}/journeys/first-business-cycle.md`, 'utf8');
  assert.match(journey, /^## Video$/m);
  assert.match(journey, /\{% embed url="https:\/\/youtu\.be\/dfykDyK6Fs8" %\}/);
  assert.equal(
    (journey.match(/\/learn\/first-business-cycle/g) ?? []).length,
    1,
    'the journey keeps one clear launch action instead of repeating the same CTA'
  );
  for (const task of [
    'Create a product',
    'Create a supplier',
    'Record a credit purchase',
    'Complete a cash sale',
    'Create a customer and set credit',
    'Complete a credit sale',
  ]) {
    assert.match(journey, new RegExp(task));
  }
});

test('learning platform documentation contains no broken relative Markdown links', async () => {
  const root = 'docs/learning-platform';
  const pending = [root];
  const markdown = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name.endsWith('.md')) markdown.push(path);
    }
  }

  for (const path of markdown) {
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (target.includes('://') || target.startsWith('#')) continue;
      const [relativePath] = target.split('#');
      const resolved = new URL(relativePath, `file://${process.cwd()}/${path}`).pathname;
      await assert.doesNotReject(readFile(resolved), `${path}: ${target}`);
    }
  }
});

test('the public site treats GitBook as an acquisition and trust surface', async () => {
  const [learning, home, layout] = await Promise.all([
    readFile('apps/site/src/app/core/public-learning.ts', 'utf8'),
    readFile('apps/site/src/app/marketing/home/home.component.ts', 'utf8'),
    readFile('apps/site/src/app/marketing/marketing-layout.component.ts', 'utf8'),
  ]);
  assert.match(learning, /https:\/\/dukarun\.gitbook\.io\/docs/);
  assert.match(home, /Open Dukarun Guide/);
  assert.match(home, /Your first business cycle/);
  assert.match(layout, /label: 'Dukarun Guide', href: DUKARUN_GUIDES_URL/);
  const primaryLinks = layout.match(
    /protected readonly links: NavLink\[\] = \[([\s\S]*?)\n  \];/
  )?.[1];
  assert.match(primaryLinks ?? '', /label: 'Blog', path: '\/blog'/);
  assert.doesNotMatch(primaryLinks ?? '', /Dukarun Guide|label: 'Guides'/);
});

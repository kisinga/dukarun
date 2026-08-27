import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contracts = {
  'apps/web/src/app/products/products.component.ts': ['product-add'],
  'apps/web/src/app/products/product-editor.component.ts': ['product-name', 'product-save'],
  'apps/web/src/app/suppliers/suppliers.component.ts': ['supplier-add'],
  'apps/web/src/app/suppliers/supplier-profile-form.component.ts': [
    'supplier-name',
    'supplier-save',
  ],
  'apps/web/src/app/purchases/purchase-editor.component.ts': ['purchase-product-search'],
  'apps/web/src/app/purchases/purchase-supplier-header.component.ts': ['purchase-supplier'],
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

test('embedded help exposes docs and full-text search without the AI assistant', async () => {
  const source = await readFile('apps/web/src/app/learning/help-embed.component.ts', 'utf8');
  assert.match(source, /tabs: \['docs', 'search'\]/);
  assert.doesNotMatch(source, /tabs: \[[^\]]*'assistant'/);
  assert.match(source, /Help needs an internet connection/);
  assert.match(source, /Open in new tab/);
});

test('GitBook import keeps every task article repeatable and connected to its guide', async () => {
  const articles = [
    'products/creating-a-product.md',
    'products/generating-product-barcodes.md',
    'suppliers/creating-a-supplier.md',
    'purchases/recording-a-credit-purchase.md',
    'selling/making-a-cash-sale.md',
    'selling/selling-by-scanning-a-barcode.md',
    'customers-and-credit/creating-a-customer-with-credit.md',
    'selling/making-a-credit-sale.md',
    'money-and-reporting/understanding-the-financial-result.md',
  ];
  const root = 'docs/learning-platform/gitbook-import';
  const requiredSections = [
    'Purpose',
    'Prerequisites',
    'Video',
    'Repeatable steps',
    'Expected result',
    'Glossary',
    'Related articles',
    'Troubleshooting',
  ];

  for (const article of articles) {
    const source = await readFile(`${root}/${article}`, 'utf8');
    for (const section of requiredSections) {
      assert.match(source, new RegExp(`^## ${section}$`, 'm'), `${article}: ${section}`);
    }
    assert.match(source, /\/media\/video\/guides\//, `${article}: stable video URL`);
    assert.match(source, /\/learn\/[a-z-]+\)/, `${article}: interactive guide link`);
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
  ]) {
    assert.match(glossary, new RegExp(`^## ${term}$`, 'm'), term);
  }

  const journey = await readFile(`${root}/journeys/first-business-cycle.md`, 'utf8');
  assert.equal((journey.match(/\/learn\/first-business-cycle/g) ?? []).length, 2);
  for (const task of [
    'Create a product',
    'Create a supplier',
    'Record a credit purchase',
    'Complete a cash sale',
    'Create a customer and enable credit',
    'Complete a credit sale',
  ]) {
    assert.match(journey, new RegExp(task));
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRapidScannerBurst,
  SCANNER_MAX_KEY_GAP_MS,
} from '../../apps/web/src/app/pos/keyboard-wedge.ts';
import {
  BARCODE_LABEL_PRESETS,
  barcodeLabelPageStyles,
} from '../../apps/web/src/app/products/barcode-label-presets.ts';

test('scanner burst accepts fast consecutive keystrokes', () => {
  assert.equal(isRapidScannerBurst([0, 20, 39, 61]), true);
});

test('scanner burst rejects normal typing gaps', () => {
  assert.equal(isRapidScannerBurst([0, 20, 20 + SCANNER_MAX_KEY_GAP_MS + 1, 150]), false);
});

test('scanner burst needs enough characters', () => {
  assert.equal(isRapidScannerBurst([0, 10, 20]), false);
});

test('barcode printing exposes only approved fixed sizes', () => {
  assert.deepEqual(
    BARCODE_LABEL_PRESETS.map(preset => preset.id),
    ['a4-grid', 'compact-roll']
  );
});

test('fixed label styles retain exact paper dimensions', () => {
  assert.match(barcodeLabelPageStyles('a4-grid'), /size: A4 portrait/);
  assert.match(barcodeLabelPageStyles('a4-grid'), /repeat\(3, 1fr\)/);
  assert.match(barcodeLabelPageStyles('compact-roll'), /size: 50mm 30mm/);
});

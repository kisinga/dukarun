import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyStkResult, parseMpesaTime } from '../../supabase/functions/_shared/mpesa.ts';

test('only known STK result codes are terminal', () => {
  assert.equal(classifyStkResult('0'), 'success');
  for (const code of ['1', '1032', '1037', '2001']) {
    assert.equal(classifyStkResult(code), 'terminal');
  }
  for (const code of ['1001', '1019', '1025', '9999', 'QUERY_ERROR', '']) {
    assert.equal(classifyStkResult(code), 'pending');
  }
});

test('Daraja timestamps are normalized to Nairobi time', () => {
  assert.equal(parseMpesaTime('20260819091530'), '2026-08-19T09:15:30+03:00');
  assert.equal(parseMpesaTime('bad'), null);
});

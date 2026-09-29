import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAmount } from '../src/format.js'

test('parseAmount accepts plain non-negative numbers only', () => {
  for (const [text, want] of [['6', 6], ['6.5', 6.5], [' 12 ', 12], ['0', 0], ['.5', 0.5], ['6.', 6], ['6,5', 6.5]]) {
    assert.equal(parseAmount(text), want, text)
  }
  for (const text of ['', ' ', 'abc', '-1', '1e3', '6g', '1.2.3', 'Infinity']) assert.equal(parseAmount(text), null, text)
})

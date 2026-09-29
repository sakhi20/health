// Run with TZ=America/New_York (see "npm test") so the DST cases hit real transitions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayKeyFor, shiftDayKey } from '../src/day.js'

test('4am day boundary', () => {
  const cases = [
    [new Date(2026, 8, 28, 3, 59, 59), '2026-09-27'],
    [new Date(2026, 8, 28, 4, 0, 0), '2026-09-28'],
    [new Date(2026, 8, 28, 0, 0, 0), '2026-09-27'],
    [new Date(2026, 8, 28, 23, 59), '2026-09-28'],
    [new Date(2026, 9, 1, 2, 0), '2026-09-30'],
    [new Date(2026, 0, 1, 1, 0), '2025-12-31'],
    [new Date(2026, 2, 8, 3, 30), '2026-03-07'], // US DST start day
    [new Date(2026, 10, 1, 1, 30), '2026-10-31'], // US DST end day
  ]
  for (const [date, want] of cases) assert.equal(dayKeyFor(date), want, date.toString())
})

test('shiftDayKey crosses month and year ends', () => {
  assert.equal(shiftDayKey('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDayKey('2026-01-01', -1), '2025-12-31')
})

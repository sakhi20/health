// Run with TZ=America/New_York (see "npm test").
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { daysSince, exportReminder, loadLastExport, saveLastExport, LAST_EXPORT_KEY } from '../src/exportReminder.js'
import { applyDayUpdate, emptyData } from '../src/storage.js'

class MemoryStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
})

const local = (...args) => new Date(...args)

test('days since export counts local calendar days', () => {
  const now = local(2026, 8, 28, 8, 0)
  assert.equal(daysSince(local(2026, 8, 28, 0, 5).toISOString(), now), 0)
  assert.equal(daysSince(local(2026, 8, 27, 23, 0).toISOString(), now), 1)
  assert.equal(daysSince(local(2026, 8, 21, 9, 0).toISOString(), now), 7)
  // Across the DST change on Nov 1: still whole days.
  assert.equal(daysSince(local(2026, 9, 30, 12, 0).toISOString(), local(2026, 10, 2, 12, 0)), 3)
})

test('export reminder labels and amber threshold', () => {
  const now = local(2026, 8, 28, 8, 0)
  assert.deepEqual(exportReminder(null, now), { label: 'Never exported', overdue: true })
  assert.deepEqual(exportReminder(local(2026, 8, 28, 7, 0).toISOString(), now), { label: 'Last export: today', overdue: false })
  assert.deepEqual(exportReminder(local(2026, 8, 27, 7, 0).toISOString(), now), { label: 'Last export: 1 day ago', overdue: false })
  assert.deepEqual(exportReminder(local(2026, 8, 22, 7, 0).toISOString(), now), { label: 'Last export: 6 days ago', overdue: false })
  assert.deepEqual(exportReminder(local(2026, 8, 21, 7, 0).toISOString(), now), { label: 'Last export: 7 days ago', overdue: true })
})

test('last export time is stored in its own key', () => {
  assert.equal(loadLastExport(), null)
  saveLastExport('2026-09-28T12:00:00.000Z')
  assert.equal(loadLastExport(), '2026-09-28T12:00:00.000Z')
  assert.equal(localStorage.getItem('health:v1'), null)
  localStorage.setItem(LAST_EXPORT_KEY, 'garbage')
  assert.equal(loadLastExport(), null)
})

test('clearing energy keeps other day data, and clearing the last value unlogs the day', () => {
  const set = (value) => ({ value, setAt: '2026-09-28T12:00:00.000Z' })
  let data = applyDayUpdate(emptyData(), '2026-09-28', (d) => ({ ...d, energy: set(4), bedtime: set('23:00') }))
  data = applyDayUpdate(data, '2026-09-28', (d) => ({ ...d, energy: null }))
  assert.deepEqual(data.days['2026-09-28'], { entries: [], bedtime: set('23:00'), wakeTime: null, energy: null })

  data = applyDayUpdate(data, '2026-09-28', (d) => ({ ...d, bedtime: null }))
  assert.equal('2026-09-28' in data.days, false)
})

test('day updates do not touch other days', () => {
  const food = { id: 'a', type: 'food', name: 'Peanuts', proteinG: 6, loggedAt: '2026-09-27T13:00:00.000Z' }
  const before = applyDayUpdate(emptyData(), '2026-09-27', (d) => ({ ...d, entries: [food] }))
  const after = applyDayUpdate(before, '2026-09-28', (d) => ({ ...d, energy: { value: 2, setAt: '2026-09-28T12:00:00.000Z' } }))
  assert.equal(after.days['2026-09-27'], before.days['2026-09-27'])
  assert.deepEqual(Object.keys(after.days).sort(), ['2026-09-27', '2026-09-28'])
})

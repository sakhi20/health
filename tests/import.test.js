import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { parseImport, previewImport, mergeData } from '../src/importData.js'
import { loadData, saveData, commitImport, toExportJson, emptyData } from '../src/storage.js'

// Minimal in-memory localStorage.
class MemoryStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
  snapshot() { return Object.fromEntries(this.map) }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
})

const sample = () => ({
  version: 1,
  days: {
    '2026-09-27': {
      entries: [
        { id: 'a1', type: 'food', name: 'Peanuts', proteinG: 6, loggedAt: '2026-09-27T13:00:00.000Z' },
        { id: 'a2', type: 'water', ml: 750, loggedAt: '2026-09-27T14:00:00.000Z' },
      ],
      bedtime: { value: '23:30', setAt: '2026-09-28T03:00:00.000Z' },
      wakeTime: null,
      energy: { value: 3, setAt: '2026-09-27T20:00:00.000Z' },
    },
    '2026-09-28': {
      entries: [{ id: 'b1', type: 'food', name: 'Black coffee', proteinG: 0, loggedAt: '2026-09-28T12:00:00.000Z' }],
      bedtime: null,
      wakeTime: { value: '07:00', setAt: '2026-09-28T11:05:00.000Z' },
      energy: null,
    },
  },
})

// Runs the same steps the Import button does: parse, merge, back up, save.
function importText(text) {
  const current = loadData()
  const parsed = parseImport(text)
  if (!parsed.ok) return parsed
  const merged = mergeData(current, parsed.data)
  return commitImport(current, merged)
}

test('round trip: export, import into empty storage, identical result', () => {
  const original = sample()
  const exported = toExportJson(original)

  assert.equal(localStorage.getItem('health:v1'), null)
  const result = importText(exported)
  assert.equal(result.ok, true)
  assert.deepEqual(loadData(), original)
  assert.equal(localStorage.getItem('health:v1'), JSON.stringify(original))
})

test('malformed files are rejected and storage is untouched', () => {
  saveData(sample())
  const before = localStorage.snapshot()

  const good = sample()
  const bad = {
    'not json': '{"version":1,',
    'array root': '[]',
    'wrong version': JSON.stringify({ ...good, version: 2 }),
    'missing days': JSON.stringify({ version: 1 }),
    'bad day key': JSON.stringify({ version: 1, days: { '28-09-2026': good.days['2026-09-28'] } }),
    'entries not a list': JSON.stringify({ version: 1, days: { '2026-09-28': { ...good.days['2026-09-28'], entries: {} } } }),
    'entry without id': JSON.stringify({
      version: 1,
      days: { '2026-09-28': { ...good.days['2026-09-28'], entries: [{ type: 'food', name: 'x', proteinG: 1, loggedAt: '2026-09-28T12:00:00Z' }] } },
    }),
    'negative protein': JSON.stringify({
      version: 1,
      days: { '2026-09-28': { ...good.days['2026-09-28'], entries: [{ id: 'z', type: 'food', name: 'x', proteinG: -1, loggedAt: '2026-09-28T12:00:00Z' }] } },
    }),
    'protein as string': JSON.stringify({
      version: 1,
      days: { '2026-09-28': { ...good.days['2026-09-28'], entries: [{ id: 'z', type: 'food', name: 'x', proteinG: '6', loggedAt: '2026-09-28T12:00:00Z' }] } },
    }),
    'unknown entry type': JSON.stringify({
      version: 1,
      days: { '2026-09-28': { ...good.days['2026-09-28'], entries: [{ id: 'z', type: 'steps', loggedAt: '2026-09-28T12:00:00Z' }] } },
    }),
    'bad timestamp': JSON.stringify({
      version: 1,
      days: { '2026-09-28': { ...good.days['2026-09-28'], entries: [{ id: 'z', type: 'water', ml: 750, loggedAt: 'yesterday' }] } },
    }),
    'energy out of range': JSON.stringify({
      version: 1,
      days: { '2026-09-28': { ...good.days['2026-09-28'], energy: { value: 6, setAt: '2026-09-28T12:00:00Z' } } },
    }),
    'bad bedtime': JSON.stringify({
      version: 1,
      days: { '2026-09-28': { ...good.days['2026-09-28'], bedtime: { value: '25:00', setAt: '2026-09-28T12:00:00Z' } } },
    }),
    'missing field': JSON.stringify({ version: 1, days: { '2026-09-28': { entries: [], bedtime: null, wakeTime: null } } }),
    'duplicate ids': JSON.stringify({
      version: 1,
      days: { ...good.days, '2026-09-26': { ...good.days['2026-09-28'] } },
    }),
  }

  for (const [label, text] of Object.entries(bad)) {
    const result = importText(text)
    assert.equal(result.ok, false, label)
    assert.equal(typeof result.error, 'string', label)
    assert.deepEqual(localStorage.snapshot(), before, `${label} changed storage`)
  }
})

test('merge dedupes by id and keeps the later setAt', () => {
  const current = sample()
  const incoming = sample()
  // Same ids: nothing should be duplicated.
  incoming.days['2026-09-27'].entries.push({ id: 'new1', type: 'food', name: 'Whey scoop', proteinG: 24, loggedAt: '2026-09-27T15:00:00.000Z' })
  incoming.days['2026-09-27'].bedtime = { value: '00:15', setAt: '2026-09-28T04:00:00.000Z' } // later: wins
  incoming.days['2026-09-27'].energy = { value: 5, setAt: '2026-09-27T19:00:00.000Z' } // earlier: loses
  incoming.days['2026-09-29'] = {
    entries: [{ id: 'c1', type: 'water', ml: 750, loggedAt: '2026-09-29T09:00:00.000Z' }],
    bedtime: null,
    wakeTime: null,
    energy: null,
  }

  assert.deepEqual(previewImport(current, incoming), { days: 3, entries: 5, newDays: 1, newEntries: 2, fieldsUpdated: 1 })

  const merged = mergeData(current, incoming)
  assert.deepEqual(merged.days['2026-09-27'].entries.map((e) => e.id), ['a1', 'a2', 'new1'])
  assert.equal(merged.days['2026-09-27'].bedtime.value, '00:15')
  assert.equal(merged.days['2026-09-27'].energy.value, 3)
  assert.deepEqual(merged.days['2026-09-28'], current.days['2026-09-28'])
  assert.deepEqual(merged.days['2026-09-29'], incoming.days['2026-09-29'])
})

test('a null field in the file never erases a set value', () => {
  const current = sample()
  const incoming = sample()
  incoming.days['2026-09-27'].bedtime = null
  assert.equal(mergeData(current, incoming).days['2026-09-27'].bedtime.value, '23:30')
})

test('importing the same file twice changes nothing the second time', () => {
  const text = toExportJson(sample())
  importText(text)
  const once = loadData()
  const preview = previewImport(once, parseImport(text).data)
  assert.deepEqual(preview, { days: 2, entries: 3, newDays: 0, newEntries: 0, fieldsUpdated: 0 })
  importText(text)
  assert.deepEqual(loadData(), once)
})

test('import backs up current data to a separate key first', () => {
  const current = sample()
  saveData(current)
  const incoming = emptyData()
  incoming.days['2026-09-29'] = {
    entries: [{ id: 'c1', type: 'water', ml: 750, loggedAt: '2026-09-29T09:00:00.000Z' }],
    bedtime: null,
    wakeTime: null,
    energy: null,
  }
  const result = importText(toExportJson(incoming))
  assert.equal(result.ok, true)
  assert.match(result.backupKey, /^health:v1:backup:/)
  assert.deepEqual(JSON.parse(localStorage.getItem(result.backupKey)), current)
  assert.equal(Object.keys(loadData().days).length, 3)
})

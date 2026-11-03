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

// ---- Settings in export and import ----

import { defaultSettings, loadSettings, saveSettings, addQuickItem, setProteinTarget, removeQuickItem, moveQuickItem } from '../src/settings.js'
import { settingsChanges } from '../src/importData.js'

// The Import button's full path, including settings replacement.
function importWithSettings(text) {
  const current = loadData()
  const currentSettings = loadSettings()
  const parsed = parseImport(text)
  if (!parsed.ok) return parsed
  return commitImport(current, mergeData(current, parsed.data), currentSettings, parsed.settings)
}

test('round trip with settings: export, import into empty storage, identical data and settings', () => {
  const data = sample()
  const settings = addQuickItem(setProteinTarget(defaultSettings(), 95), { name: 'Tofu', proteinG: 12 }, 'tofu')
  const text = toExportJson(data, settings)
  assert.equal(JSON.parse(text).version, 1)

  const result = importWithSettings(text)
  assert.equal(result.ok, true)
  assert.deepEqual(loadData(), data)
  assert.deepEqual(loadSettings(), settings)
})

test('import replaces settings rather than merging, and backs them up first', () => {
  const mine = addQuickItem(defaultSettings(), { name: 'Eggs', proteinG: 12 }, 'eggs')
  saveSettings(mine)
  const theirs = setProteinTarget(removeQuickItem(defaultSettings(), 'qa-peanuts'), 100)
  const result = importWithSettings(toExportJson(emptyData(), theirs))
  assert.equal(result.ok, true)
  assert.deepEqual(loadSettings(), theirs)
  assert.equal(loadSettings().quickAdd.some((q) => q.id === 'eggs'), false)
  assert.deepEqual(JSON.parse(localStorage.getItem(result.settingsBackupKey)), mine)
})

test('an export without settings leaves current settings alone', () => {
  const mine = setProteinTarget(defaultSettings(), 110)
  saveSettings(mine)
  const result = importWithSettings(toExportJson(sample()))
  assert.equal(result.ok, true)
  assert.equal(result.settingsBackupKey, null)
  assert.deepEqual(loadSettings(), mine)
})

test('invalid settings reject the whole file and change nothing', () => {
  saveData(sample())
  saveSettings(defaultSettings())
  const before = localStorage.snapshot()
  const good = defaultSettings()
  const bad = [
    { ...good, version: 2 },
    { ...good, proteinTargetG: 0 },
    { ...good, waterTargetBottles: 2.5 },
    { ...good, quickAdd: 'nope' },
    { ...good, quickAdd: [{ id: 'a', name: '', proteinG: 3 }] },
    { ...good, quickAdd: [{ id: 'a', name: 'x', proteinG: 3 }, { id: 'a', name: 'y', proteinG: 3 }] },
    'settings',
  ]
  for (const settings of bad) {
    const result = importWithSettings(JSON.stringify({ version: 1, days: {}, settings }))
    assert.equal(result.ok, false, JSON.stringify(settings))
    assert.match(result.error, /^Settings /)
    assert.deepEqual(localStorage.snapshot(), before)
  }
})

test('settings changes are listed for the preview', () => {
  const current = defaultSettings()
  assert.equal(settingsChanges(current, null), null)
  assert.deepEqual(settingsChanges(current, defaultSettings()), [])

  let incoming = setProteinTarget(current, 90)
  incoming = { ...incoming, waterTargetBottles: 4 }
  incoming = removeQuickItem(incoming, 'qa-peanuts')
  incoming = addQuickItem(incoming, { name: 'Tofu', proteinG: 12 }, 'tofu')
  incoming = { ...incoming, quickAdd: incoming.quickAdd.map((q) => (q.id === 'qa-whey' ? { ...q, proteinG: 25 } : q)) }
  incoming = moveQuickItem(incoming, 2, 0)
  assert.deepEqual(settingsChanges(current, incoming), [
    'Protein target: 80 g to 90 g',
    'Water target: 3 to 4 bottles',
    'Quick add, added: Tofu',
    'Quick add, removed: Peanuts',
    'Quick add, edited: Whey scoop',
    'Quick add order changed',
  ])
})

// ---- Workouts in export and import ----

import { previewWorkouts, mergeWorkouts } from '../src/importData.js'
import { emptyWorkouts, loadWorkouts, saveWorkouts, putSession } from '../src/workouts.js'

// The Import button's full path, including workouts.
function importAll(text) {
  const current = loadData()
  const currentSettings = loadSettings()
  const currentWorkouts = loadWorkouts()
  const parsed = parseImport(text)
  if (!parsed.ok) return parsed
  const nextWorkouts = parsed.workouts === null ? null : mergeWorkouts(currentWorkouts, parsed.workouts)
  return commitImport(current, mergeData(current, parsed.data), currentSettings, parsed.settings, currentWorkouts, nextWorkouts)
}

const sessionA = (updatedAt, reps = 10) => ({
  workout: 'A',
  exercises: [
    { id: 'dumbbell-bench-press', sets: [{ weightLb: 12.5, reps }, { weightLb: 12.5, reps: 8 }] },
    { id: 'plank', sets: [{ seconds: 20, targetSec: 20 }] },
  ],
  walkMin: 10,
  loggedAt: '2026-11-03T22:00:00.000Z',
  updatedAt,
})
const sessionB = {
  workout: 'B',
  exercises: [{ id: 'leg-curl', sets: [{ weightLb: 40, reps: 10 }] }],
  walkMin: null,
  loggedAt: '2026-11-05T22:00:00.000Z',
  updatedAt: '2026-11-05T22:00:00.000Z',
}
const sampleWorkouts = () => ({
  version: 2,
  sessions: { '2026-11-03': sessionA('2026-11-03T22:00:00.000Z'), '2026-11-05': sessionB },
})

test('round trip with workouts: export, import into empty storage, everything identical', () => {
  const data = sample()
  const settings = defaultSettings()
  const workouts = sampleWorkouts()
  const text = toExportJson(data, settings, workouts)
  assert.equal(JSON.parse(text).version, 1)
  assert.equal(importAll(text).ok, true)
  assert.deepEqual(loadData(), data)
  assert.deepEqual(loadSettings(), settings)
  assert.deepEqual(loadWorkouts(), workouts)
})

test('old export files still import without error and leave workouts alone', () => {
  const mine = putSession(emptyWorkouts(), '2026-11-03', sessionA('2026-11-03T22:00:00.000Z'))
  saveWorkouts(mine)
  // Pass 1 format: log only.
  const pass1 = '{"version":1,"days":{"2026-09-20":{"entries":[{"id":"x1","type":"food","name":"Peanuts","proteinG":6,"loggedAt":"2026-09-20T13:00:00.000Z"}],"bedtime":null,"wakeTime":null,"energy":null}},"exportedAt":"2026-09-21T00:00:00.000Z"}'
  // Pass 3 format: log plus settings.
  const pass3 = JSON.stringify({ ...sample(), settings: defaultSettings(), exportedAt: '2026-09-29T00:00:00.000Z' })
  // Push/pull/legs format: version 1 workouts are ignored, not rejected.
  const pass4 = JSON.stringify({
    ...sample(),
    workouts: { version: 1, days: { '2026-09-25': { status: 'rest', loggedAt: '2026-09-25T20:00:00.000Z', updatedAt: '2026-09-25T20:00:00.000Z' } } },
  })
  for (const text of [pass1, pass3, pass4]) {
    const result = importAll(text)
    assert.equal(result.ok, true)
    assert.equal(result.workoutsBackupKey, null)
    assert.deepEqual(loadWorkouts(), mine)
  }
  assert.ok(loadData().days['2026-09-20'])
})

test('workout merge: new sessions added, the later updatedAt wins, nothing removed', () => {
  const older = { ...sessionB, workout: 'A', loggedAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }
  const current = { version: 2, sessions: { '2026-11-03': sessionA('2026-11-03T22:00:00.000Z', 10), '2026-10-31': sessionB } }
  const incoming = {
    version: 2,
    sessions: {
      '2026-11-03': sessionA('2026-11-04T09:00:00.000Z', 12), // edited later on another device: wins
      '2026-10-31': older, // older: loses
      '2026-11-05': sessionB, // new
    },
  }
  assert.deepEqual(previewWorkouts(current, incoming), { sessions: 3, newSessions: 1, updatedSessions: 1 })
  assert.equal(previewWorkouts(current, null), null)
  const merged = mergeWorkouts(current, incoming)
  assert.equal(merged.sessions['2026-11-03'].exercises[0].sets[0].reps, 12)
  assert.equal(merged.sessions['2026-10-31'], current.sessions['2026-10-31'])
  assert.deepEqual(merged.sessions['2026-11-05'], sessionB)
  assert.equal(mergeWorkouts(current, null), current)
})

test('import backs up workouts before changing them', () => {
  const mine = putSession(emptyWorkouts(), '2026-10-31', sessionB)
  saveWorkouts(mine)
  const result = importAll(toExportJson(emptyData(), null, sampleWorkouts()))
  assert.equal(result.ok, true)
  assert.deepEqual(JSON.parse(localStorage.getItem(result.workoutsBackupKey)), mine)
  assert.equal(Object.keys(loadWorkouts().sessions).length, 3)
})

test('malformed workouts reject the whole file and change nothing', () => {
  saveData(sample())
  saveWorkouts(sampleWorkouts())
  const before = localStorage.snapshot()
  const w = (sessions) => JSON.stringify({ version: 1, days: {}, workouts: { version: 2, sessions } })
  const s = sessionA('2026-11-03T22:00:00.000Z')
  const withSet = (set) => ({ ...s, exercises: [{ id: 'leg-press', sets: [set] }] })
  const bad = [
    JSON.stringify({ version: 1, days: {}, workouts: [] }),
    JSON.stringify({ version: 1, days: {}, workouts: { version: 3, sessions: {} } }),
    JSON.stringify({ version: 1, days: {}, workouts: { version: 2, days: {} } }),
    w({ '03-11-2026': s }),
    w({ '2026-11-03': { ...s, workout: 'C' } }),
    w({ '2026-11-03': { ...s, updatedAt: 'later' } }),
    w({ '2026-11-03': { ...s, walkMin: 0 } }),
    w({ '2026-11-03': { ...s, walkMin: '10' } }),
    w({ '2026-11-03': { ...s, exercises: 'none' } }),
    w({ '2026-11-03': { ...s, exercises: [s.exercises[0], s.exercises[0]] } }),
    w({ '2026-11-03': { ...s, exercises: [{ id: '', sets: [{ weightLb: 10, reps: 10 }] }] } }),
    w({ '2026-11-03': { ...s, exercises: [{ id: 'leg-press', sets: [] }] } }),
    w({ '2026-11-03': withSet({ weightLb: 35, reps: 0 }) }),
    w({ '2026-11-03': withSet({ weightLb: 35, reps: 8.5 }) }),
    w({ '2026-11-03': withSet({ weightLb: -1, reps: 8 }) }),
    w({ '2026-11-03': withSet({ weightLb: '35', reps: 8 }) }),
    w({ '2026-11-03': withSet({ reps: 8 }) }),
    w({ '2026-11-03': withSet({ seconds: 20 }) }),
    w({ '2026-11-03': withSet({ seconds: 0, targetSec: 20 }) }),
  ]
  for (const text of bad) {
    const result = importAll(text)
    assert.equal(result.ok, false, text)
    assert.match(result.error, /^Workout|^Workouts/, text)
    assert.deepEqual(localStorage.snapshot(), before, text)
  }
})

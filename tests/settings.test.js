import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  SETTINGS_KEY,
  defaultSettings,
  normalizeSettings,
  loadSettings,
  saveSettings,
  setProteinTarget,
  setWaterTarget,
  addQuickItem,
  updateQuickItem,
  removeQuickItem,
  moveQuickItem,
} from '../src/settings.js'

class MemoryStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
})

const names = (s) => s.quickAdd.map((q) => q.name)

test('defaults match the values that used to be hardcoded', () => {
  const s = defaultSettings()
  assert.equal(s.proteinTargetG, 80)
  assert.deepEqual(
    s.quickAdd.map((q) => [q.name, q.proteinG]),
    [['Roasted chana', 6], ['Peanuts', 6], ['Greek yogurt', 15], ['Whey scoop', 24]],
  )
})

test('settings round trip through their own key, not health:v1', () => {
  const s = addQuickItem(setProteinTarget(defaultSettings(), 95), { name: 'Tofu', proteinG: 12 }, 'tofu')
  assert.equal(saveSettings(s), true)
  assert.deepEqual(loadSettings(), s)
  assert.equal(localStorage.getItem('health:v1'), null)
  assert.ok(localStorage.getItem(SETTINGS_KEY))
})

test('missing or unreadable settings fall back to defaults', () => {
  assert.deepEqual(loadSettings(), defaultSettings())
  localStorage.setItem(SETTINGS_KEY, '{not json')
  assert.deepEqual(loadSettings(), defaultSettings())
})

test('normalize keeps valid fields and drops only the bad ones', () => {
  const s = normalizeSettings({
    proteinTargetG: -5,
    waterTargetBottles: 4,
    quickAdd: [
      { id: 'a', name: '  Eggs ', proteinG: 12 },
      { id: 'b', name: '', proteinG: 5 },
      { id: 'c', name: 'Lentils', proteinG: '9' },
      { id: 'a', name: 'Duplicate id', proteinG: 1 },
      { name: 'No id', proteinG: 1 },
    ],
  })
  assert.equal(s.proteinTargetG, 80)
  assert.equal(s.waterTargetBottles, 4)
  assert.deepEqual(s.quickAdd, [{ id: 'a', name: 'Eggs', proteinG: 12 }])
})

test('an emptied quick-add list stays empty after reload', () => {
  let s = defaultSettings()
  for (const q of s.quickAdd) s = removeQuickItem(s, q.id)
  saveSettings(s)
  assert.deepEqual(loadSettings().quickAdd, [])
})

test('protein and water targets reject invalid values', () => {
  const s = defaultSettings()
  assert.equal(setProteinTarget(s, 120).proteinTargetG, 120)
  assert.equal(setProteinTarget(s, 62.5).proteinTargetG, 62.5)
  for (const bad of [0, -1, NaN, Infinity, 501, '100', null]) assert.equal(setProteinTarget(s, bad), s, String(bad))
  assert.equal(setWaterTarget(s, 5).waterTargetBottles, 5)
  for (const bad of [0, 2.5, 21, '3']) assert.equal(setWaterTarget(s, bad), s, String(bad))
})

test('add, edit and remove quick-add items', () => {
  let s = defaultSettings()
  s = addQuickItem(s, { name: ' Tofu ', proteinG: 12 }, 'tofu')
  assert.deepEqual(s.quickAdd.at(-1), { id: 'tofu', name: 'Tofu', proteinG: 12 })
  assert.equal(addQuickItem(s, { name: '', proteinG: 3 }), s)
  assert.equal(addQuickItem(s, { name: 'x', proteinG: -3 }), s)

  s = updateQuickItem(s, 'tofu', { name: 'Firm tofu', proteinG: 14 })
  assert.deepEqual(s.quickAdd.at(-1), { id: 'tofu', name: 'Firm tofu', proteinG: 14 })
  assert.equal(updateQuickItem(s, 'tofu', { name: ' ', proteinG: 1 }), s)
  assert.equal(updateQuickItem(s, 'missing', { name: 'x', proteinG: 1 }), s)

  s = removeQuickItem(s, 'qa-peanuts')
  assert.deepEqual(names(s), ['Roasted chana', 'Greek yogurt', 'Whey scoop', 'Firm tofu'])
})

test('reorder quick-add items', () => {
  const s = defaultSettings()
  assert.deepEqual(names(moveQuickItem(s, 3, 0)), ['Whey scoop', 'Roasted chana', 'Peanuts', 'Greek yogurt'])
  assert.deepEqual(names(moveQuickItem(s, 0, 2)), ['Peanuts', 'Greek yogurt', 'Roasted chana', 'Whey scoop'])
  assert.equal(moveQuickItem(s, 0, 0), s)
  assert.equal(moveQuickItem(s, -1, 2), s)
  assert.equal(moveQuickItem(s, 1, 4), s)
})

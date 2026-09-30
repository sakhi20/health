// Guards the editable exercise list against mistakes when it's changed by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXERCISES, SPLITS, BAND_LEVELS } from '../src/exercises.js'

test('the three splits exist', () => {
  assert.deepEqual(Object.keys(SPLITS), ['push', 'pull', 'legs'])
  for (const split of Object.values(SPLITS)) assert.ok(split.name && split.exercises.length > 0)
})

test('every exercise in a split is defined, and appears only once', () => {
  const all = Object.values(SPLITS).flatMap((s) => s.exercises)
  for (const id of all) assert.ok(EXERCISES[id], `${id} is listed in a split but not defined`)
  assert.equal(new Set(all).size, all.length, 'an exercise is listed twice')
})

test('ids are stable-looking and names are unique', () => {
  for (const [id, ex] of Object.entries(EXERCISES)) {
    assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id "${id}" should be lowercase-with-dashes`)
    assert.ok(typeof ex.name === 'string' && ex.name.trim() !== '', `${id} has no name`)
    assert.ok(['weight', 'band'].includes(ex.kind), `${id} has kind "${ex.kind}"`)
  }
  const names = Object.values(EXERCISES).map((e) => e.name.trim().toLowerCase())
  assert.equal(new Set(names).size, names.length, 'two exercises share a name')
})

test('the starting list matches what was asked for', () => {
  const byName = (split) => SPLITS[split].exercises.map((id) => EXERCISES[id].name.toLowerCase())
  assert.deepEqual(byName('push'), ['floor press', 'dumbbell overhead press', 'banded chest fly', 'overhead tricep extension'])
  assert.deepEqual(byName('pull'), ['banded row', 'single arm dumbbell row', 'banded face pull', 'dumbbell curl'])
  assert.deepEqual(byName('legs'), ['goblet squat', 'romanian deadlift', 'dumbbell lunge', 'hip thrust', 'calf raise'])
  assert.deepEqual(BAND_LEVELS, ['light', 'medium', 'heavy'])
})

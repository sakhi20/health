import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyWorkouts,
  loadWorkouts,
  saveWorkouts,
  dayStatus,
  lastSession,
  buildExercises,
  draftToWorkout,
  restDay,
  putDay,
  removeDay,
  loadDraft,
  saveDraft,
  WORKOUTS_KEY,
} from '../src/workouts.js'

class MemoryStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
})

const T = (s) => `2026-09-${s}T18:00:00.000Z`
const push = (day, exercises) => ({ status: 'workout', split: 'push', exercises, loggedAt: T(day), updatedAt: T(day) })
const ex = (exerciseId, sets, skipped = false) => ({ exerciseId, skipped, sets })

function history() {
  let s = emptyWorkouts()
  s = putDay(s, '2026-09-20', push(20, [ex('floor-press', [{ weightLb: 20, reps: 10 }]), ex('banded-chest-fly', [{ band: 'light', reps: 15 }])]))
  s = putDay(s, '2026-09-24', push(24, [
    ex('floor-press', [{ weightLb: 25, reps: 10 }, { weightLb: 25, reps: 8 }]),
    ex('banded-chest-fly', [], true), // skipped: prefill must look further back
  ]))
  s = putDay(s, '2026-09-25', restDay(null, new Date(T(25))))
  return s
}

test('rest day, workout and nothing logged are three different states', () => {
  const s = history()
  assert.deepEqual(dayStatus(s, '2026-09-24'), { status: 'workout', split: 'push' })
  assert.deepEqual(dayStatus(s, '2026-09-25'), { status: 'rest' })
  assert.equal(dayStatus(s, '2026-09-26'), null)
  assert.equal(dayStatus(removeDay(s, '2026-09-25'), '2026-09-25'), null)
})

test('last session is the latest earlier day the exercise was done, skipping skips and rest days', () => {
  const s = history()
  assert.deepEqual(lastSession(s, 'floor-press', '2026-09-28'), { dayKey: '2026-09-24', sets: [{ weightLb: 25, reps: 10 }, { weightLb: 25, reps: 8 }] })
  assert.deepEqual(lastSession(s, 'banded-chest-fly', '2026-09-28'), { dayKey: '2026-09-20', sets: [{ band: 'light', reps: 15 }] })
  // Backfilling an earlier day never prefills from a later one.
  assert.deepEqual(lastSession(s, 'floor-press', '2026-09-24').dayKey, '2026-09-20')
  assert.equal(lastSession(s, 'floor-press', '2026-09-20'), null)
  assert.equal(lastSession(s, 'goblet-squat', '2026-09-28'), null)
})

test('prefill copies the last session, and the first time gives one empty set', () => {
  const list = buildExercises(history(), '2026-09-28', 'push')
  assert.deepEqual(list.map((e) => e.exerciseId), ['floor-press', 'dumbbell-overhead-press', 'banded-chest-fly', 'overhead-tricep-extension'])
  const [floor, ohp, fly] = list
  assert.deepEqual(floor, { exerciseId: 'floor-press', skipped: false, sets: [{ weight: '25', reps: '10' }, { weight: '25', reps: '8' }], lastDayKey: '2026-09-24' })
  assert.deepEqual(ohp, { exerciseId: 'dumbbell-overhead-press', skipped: false, sets: [{ weight: '', reps: '' }], lastDayKey: null })
  assert.deepEqual(fly.sets, [{ band: 'light', reps: '15' }])
})

test("reopening a saved day shows what was saved, not the last session", () => {
  let s = history()
  s = putDay(s, '2026-09-28', push(28, [
    ex('floor-press', [{ weightLb: 30, reps: 6 }]),
    ex('dumbbell-overhead-press', [], true),
    ex('banded-chest-fly', [{ band: 'heavy', reps: 12 }]),
    ex('overhead-tricep-extension', [{ weightLb: 15, reps: 12 }]),
  ]))
  const [floor, ohp, fly] = buildExercises(s, '2026-09-28', 'push')
  assert.deepEqual(floor.sets, [{ weight: '30', reps: '6' }])
  assert.equal(ohp.skipped, true)
  assert.deepEqual(fly.sets, [{ band: 'heavy', reps: '12' }])
  // A different split on the same day starts from prefill.
  assert.equal(buildExercises(s, '2026-09-28', 'legs')[0].exerciseId, 'goblet-squat')
})

test('an exercise saved earlier but removed from the list is kept', () => {
  const s = putDay(emptyWorkouts(), '2026-09-28', push(28, [ex('floor-press', [{ weightLb: 30, reps: 6 }]), ex('old-exercise', [{ weightLb: 10, reps: 5 }])]))
  const list = buildExercises(s, '2026-09-28', 'push')
  assert.equal(list.at(-1).exerciseId, 'old-exercise')
  const saved = draftToWorkout(list.map((e) => (e.exerciseId === 'floor-press' || e.exerciseId === 'old-exercise' ? e : { ...e, skipped: true })), 'push', s.days['2026-09-28'], new Date(T(28)))
  assert.deepEqual(saved.workout.exercises.at(-1), ex('old-exercise', [{ weightLb: 10, reps: 5 }]))
})

test('saving turns typed text into numbers and keeps the first logged time', () => {
  const list = buildExercises(history(), '2026-09-28', 'push')
  list[1] = { ...list[1], sets: [{ weight: '12.5', reps: '10' }, { weight: '12.5', reps: '9' }] }
  list[3] = { ...list[3], skipped: true }
  const existing = { loggedAt: '2026-09-28T17:00:00.000Z' }
  const r = draftToWorkout(list, 'push', existing, new Date('2026-09-28T19:00:00.000Z'))
  assert.equal(r.ok, true)
  assert.deepEqual(r.workout, {
    status: 'workout',
    split: 'push',
    exercises: [
      ex('floor-press', [{ weightLb: 25, reps: 10 }, { weightLb: 25, reps: 8 }]),
      ex('dumbbell-overhead-press', [{ weightLb: 12.5, reps: 10 }, { weightLb: 12.5, reps: 9 }]),
      ex('banded-chest-fly', [{ band: 'light', reps: 15 }]),
      ex('overhead-tricep-extension', [], true),
    ],
    loggedAt: '2026-09-28T17:00:00.000Z',
    updatedAt: '2026-09-28T19:00:00.000Z',
  })
})

test('saving rejects incomplete or impossible sets and says where', () => {
  const now = new Date(T(28))
  const base = buildExercises(history(), '2026-09-28', 'push') // overhead press is blank (first time)
  let r = draftToWorkout(base, 'push', null, now)
  assert.deepEqual([r.ok, r.exerciseId, r.setIndex, r.field], [false, 'dumbbell-overhead-press', 0, 'weight'])
  assert.match(r.error, /^Dumbbell overhead press, set 1: enter a weight/)

  const fix = (patch) => base.map((e, i) => (i === 1 ? { ...e, sets: [{ weight: '10', reps: '10', ...patch }] } : i === 3 ? { ...e, skipped: true } : e))
  for (const [patch, field] of [[{ reps: '' }, 'reps'], [{ reps: '8.5' }, 'reps'], [{ reps: '0' }, 'reps'], [{ weight: '-5' }, 'weight'], [{ weight: 'ten' }, 'weight'], [{ weight: '2001' }, 'weight']]) {
    r = draftToWorkout(fix(patch), 'push', null, now)
    assert.equal(r.ok, false, JSON.stringify(patch))
    assert.equal(r.field, field, JSON.stringify(patch))
  }
  assert.equal(draftToWorkout(fix({ weight: '0' }), 'push', null, now).ok, true, 'bodyweight (0 lb) is allowed')

  const noBand = base.map((e, i) => (i === 1 ? { ...e, sets: [{ weight: '10', reps: '10' }] } : i === 2 ? { ...e, sets: [{ band: null, reps: '12' }] } : i === 3 ? { ...e, skipped: true } : e))
  r = draftToWorkout(noBand, 'push', null, now)
  assert.deepEqual([r.ok, r.field], [false, 'band'])

  const noSets = base.map((e, i) => (i === 0 ? { ...e, sets: [] } : e))
  assert.match(draftToWorkout(noSets, 'push', null, now).error, /^Floor press: add a set or skip it\./)

  const allSkipped = base.map((e) => ({ ...e, skipped: true }))
  assert.match(draftToWorkout(allSkipped, 'push', null, now).error, /Every exercise is skipped/)
})

test('a rest day keeps its first logged time when saved again', () => {
  const first = restDay(null, new Date(T(25)))
  const again = restDay(first, new Date(T(26)))
  assert.deepEqual(again, { status: 'rest', loggedAt: T(25), updatedAt: T(26) })
})

test('workouts round trip through their own key; unreadable data is kept aside', () => {
  const s = history()
  assert.equal(saveWorkouts(s), true)
  assert.deepEqual(loadWorkouts(), s)
  assert.equal(localStorage.getItem('health:v1'), null)
  localStorage.setItem(WORKOUTS_KEY, '{broken')
  assert.deepEqual(loadWorkouts(), emptyWorkouts())
  assert.ok([...localStorage.map.keys()].some((k) => k.startsWith(`${WORKOUTS_KEY}:corrupt:`)))
})

test('the unsaved draft survives a reload and can be cleared', () => {
  const draft = { dayKey: '2026-09-28', choice: 'push', bySplit: { push: buildExercises(history(), '2026-09-28', 'push') } }
  saveDraft(draft)
  assert.deepEqual(loadDraft(), draft)
  saveDraft(null)
  assert.equal(loadDraft(), null)
})

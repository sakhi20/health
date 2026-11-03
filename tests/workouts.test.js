import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { dayKeyFor, shiftDayKey } from '../src/day.js'
import { WORKOUTS, INCREMENT_LB } from '../src/program.js'
import {
  emptyWorkouts,
  loadWorkouts,
  saveWorkouts,
  putSession,
  removeSession,
  isGymDay,
  nextWorkout,
  workoutForDay,
  setCount,
  daySummary,
  lastTime,
  prefill,
  exerciseDef,
  buildDraft,
  switchWorkout,
  sessionFromDraft,
  draftHasDone,
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

// 2026-11-03 is a Tuesday.
const TUE = '2026-11-03'
const WED = '2026-11-04'
const THU = '2026-11-05'
const SAT = '2026-11-07'

const at = '2026-11-03T18:00:00.000Z'
const session = (workout, exercises, walkMin = 10) => ({ workout, exercises, walkMin, loggedAt: at, updatedAt: at })
const lifts = (id, ...sets) => ({ id, sets: sets.map(([weightLb, reps]) => ({ weightLb, reps })) })
const holds = (id, ...sets) => ({ id, sets: sets.map(([seconds, targetSec]) => ({ seconds, targetSec })) })
const store = (entries) => entries.reduce((s, [k, v]) => putSession(s, k, v), emptyWorkouts())
const def = (id) => exerciseDef(id)

// ---- Schedule and A/B rotation ----

test('gym days are Tuesday, Thursday and Saturday', () => {
  const week = Array.from({ length: 7 }, (_, i) => shiftDayKey('2026-11-01', i)) // Sunday first
  assert.deepEqual(week.map(isGymDay), [false, false, true, false, true, false, true])
})

test('first session ever is A', () => {
  assert.equal(nextWorkout(emptyWorkouts(), TUE), 'A')
  assert.equal(workoutForDay(emptyWorkouts(), WED), 'A')
})

test('next workout is the opposite of the last logged session, not tied to the weekday', () => {
  const s = store([[TUE, session('A', [])]])
  assert.equal(nextWorkout(s, THU), 'B')
  // Thursday missed: Saturday is still B, and the Tuesday after too.
  assert.equal(nextWorkout(s, SAT), 'B')
  assert.equal(nextWorkout(s, '2026-11-10'), 'B')
  const s2 = putSession(s, SAT, session('B', []))
  assert.equal(nextWorkout(s2, '2026-11-10'), 'A')
})

test('a session logged with the switch flipped sets the rotation from there', () => {
  // Tuesday was due A but B was done instead: Thursday is A.
  const s = store([[TUE, session('B', [])]])
  assert.equal(nextWorkout(s, THU), 'A')
})

test('a day with a saved session shows that workout; later sessions do not affect earlier days', () => {
  const s = store([[TUE, session('A', [])], [THU, session('B', [])]])
  assert.equal(workoutForDay(s, TUE), 'A')
  assert.equal(workoutForDay(s, THU), 'B')
  assert.equal(nextWorkout(s, TUE), 'A') // nothing before Tuesday
  assert.equal(workoutForDay(s, SAT), 'A')
})

test('switching workout keeps taps already made in either one', () => {
  const s = emptyWorkouts()
  let d = buildDraft(s, TUE)
  assert.equal(d.workout, 'A')
  d.byWorkout.A[1].sets[0].done = true
  d = switchWorkout(s, d, 'B')
  assert.equal(d.workout, 'B')
  assert.deepEqual(d.byWorkout.B.map((e) => e.id), WORKOUTS.B.map((e) => e.id))
  d = switchWorkout(s, d, 'A')
  assert.equal(d.byWorkout.A[1].sets[0].done, true)
})

test('Today summary: done, not logged on a gym day, rest day', () => {
  const s = store([[TUE, session('A', [])]])
  assert.deepEqual(daySummary(s, TUE), { logged: true, workout: 'A', gymDay: true })
  assert.deepEqual(daySummary(s, THU), { logged: false, workout: 'B', gymDay: true })
  assert.deepEqual(daySummary(s, WED), { logged: false, workout: 'B', gymDay: false })
})

// ---- 4am boundary ----

test('a session finished at 2am Wednesday belongs to Tuesday, a gym day', () => {
  const lateFinish = new Date(2026, 10, 4, 2, 30) // Wed 4 Nov, 02:30 local
  const key = dayKeyFor(lateFinish)
  assert.equal(key, TUE)
  assert.equal(isGymDay(key), true)
  const s = store([[key, session('A', [])]])
  assert.equal(nextWorkout(s, THU), 'B')
  // From 4am Wednesday it is a rest day, and Tuesday's session is "before" it.
  const wedMorning = dayKeyFor(new Date(2026, 10, 4, 4, 0))
  assert.equal(wedMorning, WED)
  assert.equal(isGymDay(wedMorning), false)
  assert.equal(workoutForDay(s, wedMorning), 'B')
})

test('a session started at 3:59am Tuesday belongs to Monday, a rest day', () => {
  const key = dayKeyFor(new Date(2026, 10, 3, 3, 59))
  assert.equal(key, '2026-11-02')
  assert.equal(isGymDay(key), false)
})

// ---- 2 to 3 sets ----

test('2 sets for the first 7 days from the first session, 3 after', () => {
  assert.equal(setCount(emptyWorkouts(), TUE), 2) // the first session itself
  const s = store([[TUE, session('A', [])]])
  assert.equal(setCount(s, TUE), 2)
  assert.equal(setCount(s, shiftDayKey(TUE, 6)), 2) // Monday 9 Nov
  assert.equal(setCount(s, shiftDayKey(TUE, 7)), 3) // Tuesday 10 Nov
  assert.equal(setCount(s, '2026-12-01'), 3)
})

test('the first session day counts from the 4am day, not the calendar date', () => {
  const s = store([[dayKeyFor(new Date(2026, 10, 4, 1, 0)), session('A', [])]]) // 1am Wed = Tuesday
  assert.equal(setCount(s, '2026-11-10'), 3)
})

test('prefill has as many sets as the day calls for; a third set copies the second', () => {
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [15, 10], [15, 9])])]])
  assert.equal(prefill(s, def('dumbbell-bench-press'), THU).sets.length, 2)
  assert.deepEqual(prefill(s, def('dumbbell-bench-press'), '2026-11-10').sets, [
    { weightLb: 15, reps: 10 },
    { weightLb: 15, reps: 9 },
    { weightLb: 15, reps: 9 },
  ])
})

// ---- Prefill and progression ----

test('no history: start weight and 10 reps; machines start empty', () => {
  const s = emptyWorkouts()
  assert.deepEqual(prefill(s, def('dumbbell-bench-press'), TUE), { up: false, lastDayKey: null, sets: [{ weightLb: 12.5, reps: 10 }, { weightLb: 12.5, reps: 10 }] })
  assert.deepEqual(prefill(s, def('leg-press'), TUE).sets[0], { weightLb: null, reps: 10 })
  assert.deepEqual(prefill(s, def('plank'), TUE).sets[0], { seconds: 20 })
  assert.deepEqual(prefill(s, def('hip-thrust'), TUE).sets[0], { weightLb: 0, reps: 10 })
  const d = buildDraft(s, TUE)
  assert.deepEqual(d.byWorkout.A[0].sets[0], { weight: '', reps: '10', done: false })
})

test('prefill copies last session set by set', () => {
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 11], [12.5, 8])])]])
  assert.deepEqual(prefill(s, def('dumbbell-bench-press'), SAT), {
    up: false,
    lastDayKey: TUE,
    sets: [{ weightLb: 12.5, reps: 11 }, { weightLb: 12.5, reps: 8 }],
  })
})

test('12 reps on every set: dumbbell goes up 2.5 lb, machine 5 lb, reps back to 8', () => {
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 12], [12.5, 12]), lifts('leg-press', [90, 12], [90, 13])])]])
  assert.deepEqual(prefill(s, def('dumbbell-bench-press'), SAT), {
    up: true,
    lastDayKey: TUE,
    sets: [{ weightLb: 12.5 + INCREMENT_LB.dumbbell, reps: 8 }, { weightLb: 15, reps: 8 }],
  })
  assert.deepEqual(prefill(s, def('leg-press'), SAT).sets, [{ weightLb: 95, reps: 8 }, { weightLb: 95, reps: 8 }])
  assert.equal(INCREMENT_LB.machine, 5)
})

test('no Up when any set is short of 12, when a set is missing, or under 8 reps', () => {
  const s = store([
    [TUE, session('A', [
      lifts('dumbbell-bench-press', [12.5, 12], [12.5, 11]),
      lifts('dumbbell-romanian-deadlift', [15, 12]), // only 1 of 2 sets done
      lifts('lat-pulldown', [50, 6], [50, 7]), // under 8: same weight, no decrease
    ])],
  ])
  const bench = prefill(s, def('dumbbell-bench-press'), SAT)
  assert.equal(bench.up, false)
  assert.deepEqual(bench.sets, [{ weightLb: 12.5, reps: 12 }, { weightLb: 12.5, reps: 11 }])
  assert.equal(prefill(s, def('dumbbell-romanian-deadlift'), SAT).up, false)
  const lat = prefill(s, def('lat-pulldown'), SAT)
  assert.equal(lat.up, false)
  assert.deepEqual(lat.sets, [{ weightLb: 50, reps: 6 }, { weightLb: 50, reps: 7 }])
})

test('Up needs all 3 sets once the program calls for 3', () => {
  const s = store([
    [TUE, session('A', [])],
    ['2026-11-10', session('A', [lifts('dumbbell-bench-press', [15, 12], [15, 12])])], // 3 sets due, 2 done
  ])
  assert.equal(prefill(s, def('dumbbell-bench-press'), '2026-11-12').up, false)
  const s2 = putSession(s, '2026-11-10', session('A', [lifts('dumbbell-bench-press', [15, 12], [15, 12], [15, 12])]))
  assert.equal(prefill(s2, def('dumbbell-bench-press'), '2026-11-12').up, true)
})

test('hip thrust goes from 0 straight to 15, then up 2.5 lb at a time', () => {
  const ht = def('hip-thrust')
  let s = store([[TUE, session('B', [lifts('hip-thrust', [0, 12], [0, 12])])]])
  assert.deepEqual(prefill(s, ht, THU), { up: true, lastDayKey: TUE, sets: [{ weightLb: 15, reps: 8 }, { weightLb: 15, reps: 8 }] })
  s = putSession(s, THU, session('B', [lifts('hip-thrust', [15, 12], [15, 12])]))
  assert.deepEqual(prefill(s, ht, SAT).sets[0], { weightLb: 17.5, reps: 8 })
  // Bodyweight that hasn't reached 12 yet stays at 0.
  const s2 = store([[TUE, session('B', [lifts('hip-thrust', [0, 12], [0, 10])])]])
  assert.deepEqual(prefill(s2, ht, THU).sets[0], { weightLb: 0, reps: 12 })
})

test('plank adds 5 seconds only when every hold matched its prefill', () => {
  const plank = def('plank')
  const matched = store([[TUE, session('A', [holds('plank', [20, 20], [25, 20])])]])
  assert.deepEqual(prefill(matched, plank, SAT), { up: true, lastDayKey: TUE, sets: [{ seconds: 25 }, { seconds: 25 }] })
  const short = store([[TUE, session('A', [holds('plank', [20, 20], [15, 20])])]])
  const p = prefill(short, plank, SAT)
  assert.equal(p.up, false)
  assert.deepEqual(p.sets, [{ seconds: 20 }, { seconds: 20 }]) // same target again
  // The target carries into the draft and back into the saved session.
  const d = buildDraft(matched, SAT, 'A') // Saturday is B in rotation; switched to A
  assert.deepEqual(d.byWorkout.A[4].sets[0], { seconds: '25', target: 25, done: false })
  d.byWorkout.A[4].sets[0].done = true
  assert.deepEqual(sessionFromDraft(d, null, new Date(at)).session.exercises, [{ id: 'plank', sets: [{ seconds: 25, targetSec: 25 }] }])
})

test('prefill and Up look back past sessions where the exercise was skipped', () => {
  const s = store([
    [TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 12], [12.5, 12]), lifts('leg-press', [80, 10], [80, 10])])],
    [THU, session('B', [lifts('goblet-squat', [15, 10], [15, 10])])],
    // Bench skipped this time; leg press done.
    [SAT, session('A', [lifts('leg-press', [85, 9], [85, 9])])],
    ['2026-11-10', session('B', [])],
  ])
  assert.deepEqual(lastTime(s, 'dumbbell-bench-press', '2026-11-12'), { dayKey: TUE, sets: s.sessions[TUE].exercises[0].sets })
  const bench = prefill(s, def('dumbbell-bench-press'), '2026-11-12')
  assert.equal(bench.lastDayKey, TUE)
  assert.equal(bench.up, true) // 12s on Tuesday still count
  assert.deepEqual(bench.sets[0], { weightLb: 15, reps: 8 })
  assert.equal(bench.sets.length, 3)
  const press = prefill(s, def('leg-press'), '2026-11-12')
  assert.equal(press.lastDayKey, SAT)
  assert.equal(press.up, false)
})

// ---- Saving ----

test('only sets marked Done are saved; exercises with none are left out', () => {
  const d = buildDraft(emptyWorkouts(), TUE)
  assert.equal(draftHasDone(d), false)
  d.byWorkout.A[1].sets[0].done = true // bench set 1, as prefilled
  d.byWorkout.A[0].sets[0] = { weight: '90', reps: '11', done: true } // leg press, typed
  d.byWorkout.A[0].sets[1] = { weight: '90', reps: '10', done: false } // not tapped
  d.byWorkout.A[4].sets[0].done = true // plank
  d.walk.done = true
  assert.equal(draftHasDone(d), true)
  const r = sessionFromDraft(d, null, new Date(at))
  assert.equal(r.ok, true)
  assert.deepEqual(r.session, {
    workout: 'A',
    exercises: [
      { id: 'leg-press', sets: [{ weightLb: 90, reps: 11 }] },
      { id: 'dumbbell-bench-press', sets: [{ weightLb: 12.5, reps: 10 }] },
      { id: 'plank', sets: [{ seconds: 20, targetSec: 20 }] },
    ],
    walkMin: 10,
    loggedAt: at,
    updatedAt: at,
  })
})

test('the walk is optional, and saving again keeps the first logged time', () => {
  const d = buildDraft(emptyWorkouts(), TUE)
  d.byWorkout.A[1].sets[0].done = true
  const first = sessionFromDraft(d, null, new Date(at)).session
  assert.equal(first.walkMin, null)
  const later = sessionFromDraft(d, first, new Date('2026-11-03T19:00:00.000Z')).session
  assert.equal(later.loggedAt, at)
  assert.equal(later.updatedAt, '2026-11-03T19:00:00.000Z')
})

test('a Done set edited to something impossible is caught on Finish', () => {
  const d = buildDraft(emptyWorkouts(), TUE)
  d.byWorkout.A[1].sets[1] = { weight: '12.5', reps: '0', done: true }
  const r = sessionFromDraft(d, null, new Date(at))
  assert.equal(r.ok, false)
  assert.deepEqual([r.exerciseId, r.setIndex, r.field], ['dumbbell-bench-press', 1, 'reps'])
  const e = buildDraft(emptyWorkouts(), TUE)
  assert.equal(sessionFromDraft(e, null, new Date(at)).ok, false) // nothing done
})

test('reopening a saved day shows saved sets as done, then any remaining planned sets', () => {
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 10])], null)]])
  const d = buildDraft(s, TUE)
  assert.equal(d.workout, 'A')
  assert.deepEqual(d.byWorkout.A[1].sets, [
    { weight: '12.5', reps: '10', done: true },
    { weight: '12.5', reps: '10', done: false },
  ])
  assert.equal(d.byWorkout.A[0].sets.every((x) => !x.done), true)
  assert.deepEqual(d.walk, { min: '10', done: false })
  // Round trip: saving it again gives the same session.
  assert.deepEqual(sessionFromDraft(d, s.sessions[TUE], new Date(at)).session, s.sessions[TUE])
})

test('an exercise saved earlier but since removed from the program is kept', () => {
  const s = store([[TUE, session('A', [lifts('old-exercise', [20, 10])])]])
  const d = buildDraft(s, TUE)
  assert.equal(d.byWorkout.A.at(-1).id, 'old-exercise')
  assert.deepEqual(sessionFromDraft(d, s.sessions[TUE], new Date(at)).session.exercises, [{ id: 'old-exercise', sets: [{ weightLb: 20, reps: 10 }] }])
})

// ---- Storage ----

test('sessions round trip through their own key; unreadable data is kept aside', () => {
  const s = store([[TUE, session('A', [lifts('leg-press', [90, 10])])]])
  assert.equal(saveWorkouts(s), true)
  assert.deepEqual(loadWorkouts(), s)
  assert.deepEqual(removeSession(s, TUE), emptyWorkouts())
  localStorage.setItem(WORKOUTS_KEY, '{nope')
  assert.deepEqual(loadWorkouts(), emptyWorkouts())
  assert.ok([...localStorage.map.keys()].some((k) => k.startsWith(`${WORKOUTS_KEY}:corrupt:`)))
})

test('the old empty push/pull/legs store is replaced; a non-empty one is kept aside', () => {
  localStorage.setItem(WORKOUTS_KEY, JSON.stringify({ version: 1, days: {} }))
  assert.deepEqual(loadWorkouts(), emptyWorkouts())
  assert.equal(localStorage.map.size, 1)
  localStorage.setItem(WORKOUTS_KEY, JSON.stringify({ version: 1, days: { [TUE]: { status: 'rest' } } }))
  assert.deepEqual(loadWorkouts(), emptyWorkouts())
  assert.ok([...localStorage.map.keys()].some((k) => k.startsWith(`${WORKOUTS_KEY}:v1:`)))
})

test('the unsaved draft survives a reload and can be cleared; an old-format draft is ignored', () => {
  const d = buildDraft(emptyWorkouts(), TUE)
  d.byWorkout.A[1].sets[0].done = true
  d.restEndsAt = 123
  saveDraft(d)
  assert.deepEqual(loadDraft(), d)
  saveDraft(null)
  assert.equal(loadDraft(), null)
  localStorage.setItem('health:workoutDraft', JSON.stringify({ dayKey: TUE, choice: 'push', bySplit: {} }))
  assert.equal(loadDraft(), null)
})

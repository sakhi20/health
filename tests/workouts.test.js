import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { dayKeyFor, shiftDayKey } from '../src/day.js'
import { WORKOUTS, INCREMENT_LB, SETS, REPS, WEIGHT_STEP_MAX_PERCENT } from '../src/program.js'
import {
  emptyWorkouts,
  loadWorkouts,
  saveWorkouts,
  putSession,
  removeSession,
  isGymDay,
  nextWorkout,
  workoutForDay,
  daySummary,
  lastTime,
  prefill,
  progressionRule,
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
// [weightLb, reps] or [weightLb, reps, targetReps]; sets logged before targets were stored have none.
const lifts = (id, ...sets) => ({
  id,
  sets: sets.map(([weightLb, reps, targetReps]) => (targetReps === undefined ? { weightLb, reps } : { weightLb, reps, targetReps })),
})
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

// ---- Sets and reps ----

// Three identical sets.
const x3 = (set) => [set, set, set]

test('every exercise gets 3 sets of 9, from the very first session', () => {
  assert.equal(SETS, 3)
  assert.equal(REPS.prefill, 9)
  const d = buildDraft(emptyWorkouts(), TUE)
  for (const ex of d.byWorkout.A) assert.equal(ex.sets.length, 3, ex.id)
})

test('Workout B has Chest press second, a machine that starts empty', () => {
  assert.deepEqual(WORKOUTS.B.slice(0, 2).map((e) => e.id), ['goblet-squat', 'chest-press'])
  assert.equal(def('chest-press').kind, 'machine')
  const d = buildDraft(emptyWorkouts(), THU, 'B')
  assert.equal(d.byWorkout.B[1].id, 'chest-press')
  assert.deepEqual(d.byWorkout.B[1].sets, x3({ weight: '', reps: '9', target: 9, done: false }))
  // Chest press weights go up by the machine increment.
  const s = store([[THU, session('B', [lifts('chest-press', [60, 9, 9], [60, 9, 9], [60, 10, 9])])]])
  assert.deepEqual(prefill(s, def('chest-press'), SAT).sets, x3({ weightLb: 65, reps: 9 }))
})

test("a session with fewer sets repeats the same numbers; missing sets copy the last one", () => {
  // Like the first session, logged when the program still called for 2 sets.
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 10], [15, 10])])]])
  assert.deepEqual(prefill(s, def('dumbbell-bench-press'), SAT), {
    up: false,
    lastDayKey: TUE,
    sets: [{ weightLb: 12.5, reps: 9 }, { weightLb: 15, reps: 9 }, { weightLb: 15, reps: 9 }],
  })
})

// ---- Prefill and progression ----

test('no history: start weight and 9 reps; machines start empty', () => {
  const s = emptyWorkouts()
  assert.deepEqual(prefill(s, def('dumbbell-bench-press'), TUE), { up: false, lastDayKey: null, sets: x3({ weightLb: 12.5, reps: 9 }) })
  assert.deepEqual(prefill(s, def('leg-press'), TUE).sets[0], { weightLb: null, reps: 9 })
  assert.deepEqual(prefill(s, def('plank'), TUE).sets, x3({ seconds: 20 }))
  assert.deepEqual(prefill(s, def('hip-thrust'), TUE).sets[0], { weightLb: 0, reps: 9 })
  const d = buildDraft(s, TUE)
  assert.deepEqual(d.byWorkout.A[0].sets[0], { weight: '', reps: '9', target: 9, done: false })
})

test('the rule is chosen from last session\'s top weight: increment over 10% means rep steps', () => {
  assert.equal(WEIGHT_STEP_MAX_PERCENT, 10)
  assert.equal(REPS.cap, 12)
  const rule = (id, ...weights) => progressionRule(def(id), weights.map((weightLb) => ({ weightLb, reps: 9 })))
  assert.equal(rule('dumbbell-bench-press', 12.5), 'reps') // 2.5 is 20%
  assert.equal(rule('dumbbell-bench-press', 22.5), 'reps') // 11.1%
  assert.equal(rule('dumbbell-bench-press', 25), 'weight') // exactly 10%
  assert.equal(rule('dumbbell-bench-press', 20, 25, 25), 'weight') // the top weight decides
  assert.equal(rule('leg-press', 45), 'reps') // 5 is 11.1%
  assert.equal(rule('leg-press', 50), 'weight')
  assert.equal(rule('hip-thrust', 0), 'weight') // the 0 to 15 lb first step
  assert.equal(rule('hip-thrust', 15), 'reps')
})

test('weight steps: 9+ reps on every set adds the increment to the top weight, reps back to 9', () => {
  const s = store([[TUE, session('A', [
    lifts('lat-pulldown', [50, 9, 9], [50, 10, 9], [50, 9, 9]),
    lifts('leg-press', [90, 9], [90, 12], [90, 9]), // older sets with no target
    lifts('dumbbell-romanian-deadlift', [25, 9, 9], [27.5, 9, 9], [27.5, 9, 9]), // mixed: the top weight goes up
  ])]])
  assert.deepEqual(prefill(s, def('lat-pulldown'), SAT), { up: true, lastDayKey: TUE, sets: x3({ weightLb: 55, reps: 9 }) })
  assert.deepEqual(prefill(s, def('leg-press'), SAT).sets, x3({ weightLb: 95, reps: 9 }))
  assert.deepEqual(prefill(s, def('dumbbell-romanian-deadlift'), SAT).sets, x3({ weightLb: 30, reps: 9 }))
})

test('weight steps: short on any set repeats the same numbers, with no decrease', () => {
  const s = store([[TUE, session('A', [
    lifts('lat-pulldown', [50, 9, 9], [50, 9, 9], [50, 8, 9]),
    lifts('leg-press', [80, 6, 9], [80, 7, 9], [80, 7, 9]),
    lifts('dumbbell-romanian-deadlift', [30, 12, 9], [30, 12, 9]), // a missing set
  ])]])
  assert.deepEqual(prefill(s, def('lat-pulldown'), SAT), { up: false, lastDayKey: TUE, sets: x3({ weightLb: 50, reps: 9 }) })
  assert.deepEqual(prefill(s, def('leg-press'), SAT).sets, x3({ weightLb: 80, reps: 9 }))
  assert.deepEqual(prefill(s, def('dumbbell-romanian-deadlift'), SAT), { up: false, lastDayKey: TUE, sets: x3({ weightLb: 30, reps: 9 }) })
})

test('rep steps: reaching the prefilled reps on every set adds one rep per set, same weights', () => {
  const bench = def('dumbbell-bench-press')
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 10, 10], [15, 10, 10], [15, 11, 10])])]])
  assert.deepEqual(prefill(s, bench, SAT), {
    up: true,
    lastDayKey: TUE,
    sets: [{ weightLb: 12.5, reps: 11 }, { weightLb: 15, reps: 11 }, { weightLb: 15, reps: 11 }],
  })
  // Older sets with no target count as prefilled at 9.
  const old = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 9], [12.5, 9], [12.5, 10])])]])
  assert.deepEqual(prefill(old, bench, SAT), { up: true, lastDayKey: TUE, sets: x3({ weightLb: 12.5, reps: 10 }) })
  // Reps stop at 12.
  const at11 = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 11, 11], [12.5, 11, 11], [12.5, 11, 11])])]])
  assert.deepEqual(prefill(at11, bench, SAT).sets, x3({ weightLb: 12.5, reps: 12 }))
})

test('rep steps: 12 on every set adds the increment to each set\'s own weight, reps back to 9', () => {
  const bench = def('dumbbell-bench-press')
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 12, 12], [15, 12, 12], [15, 13, 12])])]])
  assert.deepEqual(prefill(s, bench, SAT), {
    up: true,
    lastDayKey: TUE,
    sets: [{ weightLb: 15, reps: 9 }, { weightLb: 17.5, reps: 9 }, { weightLb: 17.5, reps: 9 }],
  })
  // 12 on every set counts even when the prefill was lower.
  const early = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 12, 10], [12.5, 12, 10], [12.5, 12, 10])])]])
  assert.deepEqual(prefill(early, bench, SAT).sets, x3({ weightLb: 15, reps: 9 }))
})

test('rep steps: short of the prefilled reps on any set repeats the same numbers', () => {
  const bench = def('dumbbell-bench-press')
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 11, 11], [12.5, 11, 11], [12.5, 10, 11])])]])
  assert.deepEqual(prefill(s, bench, SAT), { up: false, lastDayKey: TUE, sets: x3({ weightLb: 12.5, reps: 11 }) })
  const missing = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 12, 11], [12.5, 12, 11])])]])
  assert.deepEqual(prefill(missing, bench, SAT), { up: false, lastDayKey: TUE, sets: x3({ weightLb: 12.5, reps: 11 }) })
})

test('tapping Done as prefilled every session: rep steps until the increment is 10% or less, then weight steps', () => {
  let s = emptyWorkouts()
  const log = { bench: [], press: [] }
  for (let k = 0; k < 25; k++) {
    const day = shiftDayKey(TUE, k)
    const d = buildDraft(s, day, 'A')
    const [press, bench] = d.byWorkout.A
    if (k === 0) for (const set of press.sets) set.weight = '40' // leg press: found the weight
    log.bench.push(`${bench.sets[0].weight}x${bench.sets[0].reps}${bench.up ? ' Up' : ''}`)
    log.press.push(`${press.sets[0].weight}x${press.sets[0].reps}${press.up ? ' Up' : ''}`)
    for (const set of [...press.sets, ...bench.sets]) set.done = true
    const r = sessionFromDraft(d, null, new Date(at))
    assert.equal(r.ok, true)
    if (k === 0) assert.deepEqual(r.session.exercises[1].sets[0], { weightLb: 12.5, reps: 9, targetReps: 9 })
    s = putSession(s, day, r.session)
  }
  const reps4 = (w) => [`${w}x9 Up`, `${w}x10 Up`, `${w}x11 Up`, `${w}x12 Up`]
  assert.deepEqual(log.bench, [
    '12.5x9', '12.5x10 Up', '12.5x11 Up', '12.5x12 Up', // 2.5 lb is 20% of 12.5: rep steps
    ...reps4(15), ...reps4(17.5), ...reps4(20), ...reps4(22.5), // still over 10%
    '25x9 Up', '27.5x9 Up', '30x9 Up', '32.5x9 Up', '35x9 Up', // 10% or less: weight steps
  ])
  assert.deepEqual(log.press.slice(0, 11), [
    '40x9', '40x10 Up', '40x11 Up', '40x12 Up', // 5 lb is 12.5% of 40
    ...reps4(45), // 11.1%
    '50x9 Up', '55x9 Up', '60x9 Up', // 10% and under
  ])
})

test('hip thrust goes from 0 straight to 15, then takes rep steps', () => {
  const ht = def('hip-thrust')
  let s = store([[TUE, session('B', [lifts('hip-thrust', [0, 9, 9], [0, 9, 9], [0, 10, 9])])]])
  assert.deepEqual(prefill(s, ht, THU), { up: true, lastDayKey: TUE, sets: x3({ weightLb: 15, reps: 9 }) })
  s = putSession(s, THU, session('B', [lifts('hip-thrust', [15, 9, 9], [15, 9, 9], [15, 9, 9])]))
  assert.deepEqual(prefill(s, ht, SAT), { up: true, lastDayKey: THU, sets: x3({ weightLb: 15, reps: 10 }) })
  s = putSession(s, SAT, session('B', [lifts('hip-thrust', [15, 12, 12], [15, 12, 12], [15, 12, 12])]))
  assert.deepEqual(prefill(s, ht, '2026-11-10').sets, x3({ weightLb: 17.5, reps: 9 }))
  // Bodyweight with a set under 9 stays at 0.
  const s2 = store([[TUE, session('B', [lifts('hip-thrust', [0, 9, 9], [0, 9, 9], [0, 8, 9])])]])
  assert.deepEqual(prefill(s2, ht, THU), { up: false, lastDayKey: TUE, sets: x3({ weightLb: 0, reps: 9 }) })
})

test('plank adds 5 seconds only when every hold matched its prefill', () => {
  const plank = def('plank')
  const matched = store([[TUE, session('A', [holds('plank', [20, 20], [25, 20], [20, 20])])]])
  assert.deepEqual(prefill(matched, plank, SAT), { up: true, lastDayKey: TUE, sets: x3({ seconds: 25 }) })
  const short = store([[TUE, session('A', [holds('plank', [20, 20], [15, 20], [20, 20])])]])
  const p = prefill(short, plank, SAT)
  assert.equal(p.up, false)
  assert.deepEqual(p.sets, x3({ seconds: 20 })) // same target again
  // The target carries into the draft and back into the saved session.
  const d = buildDraft(matched, SAT, 'A') // Saturday is B in rotation; switched to A
  assert.deepEqual(d.byWorkout.A[4].sets[0], { seconds: '25', target: 25, done: false })
  d.byWorkout.A[4].sets[0].done = true
  assert.deepEqual(sessionFromDraft(d, null, new Date(at)).session.exercises, [{ id: 'plank', sets: [{ seconds: 25, targetSec: 25 }] }])
})

test('plank goes up from a 2-set session: only the logged holds count (Nov 3: 30 s, 30 s vs 20 s)', () => {
  const plank = def('plank')
  const nov3 = store([['2026-11-03', session('A', [holds('plank', [30, 20], [30, 20])])]])
  assert.deepEqual(prefill(nov3, plank, '2026-11-07'), { up: true, lastDayKey: '2026-11-03', sets: x3({ seconds: 25 }) })
  // One logged hold short of its target: no Up, same target.
  const short = store([['2026-11-03', session('A', [holds('plank', [30, 20], [18, 20])])]])
  assert.deepEqual(prefill(short, plank, '2026-11-07'), { up: false, lastDayKey: '2026-11-03', sets: x3({ seconds: 20 }) })
})

test('prefill and Up look back past sessions where the exercise was skipped', () => {
  const s = store([
    [TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 9, 9], [12.5, 10, 9], [12.5, 9, 9]), lifts('leg-press', [80, 10], [80, 10], [80, 10])])],
    [THU, session('B', [lifts('goblet-squat', [15, 10], [15, 10], [15, 10])])],
    // Bench skipped this time; leg press done, one set under 9.
    [SAT, session('A', [lifts('leg-press', [85, 9], [85, 9], [85, 8])])],
    ['2026-11-10', session('B', [])],
  ])
  assert.deepEqual(lastTime(s, 'dumbbell-bench-press', '2026-11-12'), { dayKey: TUE, sets: s.sessions[TUE].exercises[0].sets })
  const bench = prefill(s, def('dumbbell-bench-press'), '2026-11-12')
  assert.equal(bench.lastDayKey, TUE)
  assert.equal(bench.up, true) // Tuesday's sets still count
  assert.deepEqual(bench.sets, x3({ weightLb: 12.5, reps: 10 }))
  const press = prefill(s, def('leg-press'), '2026-11-12')
  assert.equal(press.lastDayKey, SAT)
  assert.equal(press.up, false)
  assert.deepEqual(press.sets[0], { weightLb: 85, reps: 9 })
})

test('a 2-set session does not count toward Up for lifts, now that 3 are called for', () => {
  const s = store([[TUE, session('A', [lifts('dumbbell-bench-press', [12.5, 10], [12.5, 10])])]])
  assert.equal(prefill(s, def('dumbbell-bench-press'), SAT).up, false)
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
      { id: 'leg-press', sets: [{ weightLb: 90, reps: 11 }] }, // replaced set: no target
      { id: 'dumbbell-bench-press', sets: [{ weightLb: 12.5, reps: 9, targetReps: 9 }] },
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
    { weight: '12.5', reps: '10', done: true }, // saved before targets: none
    { weight: '12.5', reps: '9', target: 9, done: false },
    { weight: '12.5', reps: '9', target: 9, done: false },
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

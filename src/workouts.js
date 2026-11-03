// Workout sessions live in their own key, separate from the health:v1 log.
// Sessions are keyed by day, using the same 4am boundary (dayKeyFor in day.js).
//
// Stored shape:
// { version: 2, sessions: { "2026-11-03": Session } }
//   Session:  { workout: 'A' | 'B', exercises: [{ id, sets }], walkMin: number | null, loggedAt, updatedAt }
//   Set:      { weightLb, reps } for dumbbells and machines
//             { seconds, targetSec } for holds (targetSec is what was prefilled)
// Only sets marked Done are stored; an exercise with none is left out.
// Rest days are not stored: the schedule in program.js decides them.
import { shiftDayKey, weekdayOf } from './day.js'
import { parseAmount } from './format.js'
import {
  GYM_WEEKDAYS,
  REPS,
  FIRST_SETS,
  FIRST_DAYS,
  SETS,
  WALK_MINUTES,
  INCREMENT_LB,
  HOLD_INCREMENT_SEC,
  WORKOUTS,
} from './program.js'

export const WORKOUTS_KEY = 'health:workouts'
export const DRAFT_KEY = 'health:workoutDraft'
export const MAX_REPS = 1000
export const MAX_WEIGHT_LB = 2000
export const MAX_SECONDS = 3600
export const MAX_WALK_MIN = 600

export const emptyWorkouts = () => ({ version: 2, sessions: {} })

export function loadWorkouts() {
  let raw
  try {
    raw = localStorage.getItem(WORKOUTS_KEY)
  } catch {
    return emptyWorkouts()
  }
  if (!raw) return emptyWorkouts()
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    // fall through
  }
  if (parsed?.version === 2 && parsed.sessions && typeof parsed.sessions === 'object') return parsed
  // The old push/pull/legs format with nothing in it: just start fresh.
  if (parsed?.version === 1 && parsed.days && typeof parsed.days === 'object' && Object.keys(parsed.days).length === 0) {
    return emptyWorkouts()
  }
  // Unreadable or old data: keep a copy rather than letting the next save overwrite it.
  try {
    localStorage.setItem(`${WORKOUTS_KEY}:${parsed?.version === 1 ? 'v1' : 'corrupt'}:${Date.now()}`, raw)
  } catch {
    // nothing more we can do
  }
  return emptyWorkouts()
}

export function saveWorkouts(store) {
  try {
    localStorage.setItem(WORKOUTS_KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}

export const putSession = (store, dayKey, session) => ({ ...store, sessions: { ...store.sessions, [dayKey]: session } })

export function removeSession(store, dayKey) {
  const sessions = { ...store.sessions }
  delete sessions[dayKey]
  return { ...store, sessions }
}

// ---- Program lookups ----

const BY_ID = new Map(Object.values(WORKOUTS).flatMap((list) => list.map((ex) => [ex.id, ex])))

export const exerciseDef = (id) => BY_ID.get(id) ?? null
export const exerciseName = (id) => BY_ID.get(id)?.name ?? id

// ---- Schedule ----

export const isGymDay = (dayKey) => GYM_WEEKDAYS.includes(weekdayOf(dayKey))
export const otherWorkout = (w) => (w === 'A' ? 'B' : 'A')

const keysBefore = (store, dayKey) =>
  Object.keys(store.sessions)
    .filter((k) => k < dayKey)
    .sort()
    .reverse()

// The opposite of the last session before this day, whatever weekday that was. A first.
export function nextWorkout(store, dayKey) {
  const [last] = keysBefore(store, dayKey)
  return last ? otherWorkout(store.sessions[last].workout) : 'A'
}

// What this day shows: the saved session's workout, otherwise the next in rotation.
export const workoutForDay = (store, dayKey) => store.sessions[dayKey]?.workout ?? nextWorkout(store, dayKey)

// Sets per exercise on this day: fewer for the first days after the very first session.
export function setCount(store, dayKey) {
  const first = [dayKey, ...Object.keys(store.sessions)].sort()[0]
  return dayKey < shiftDayKey(first, FIRST_DAYS) ? FIRST_SETS : SETS
}

// For the Today screen.
export function daySummary(store, dayKey) {
  const saved = store.sessions[dayKey]
  if (saved) return { logged: true, workout: saved.workout, gymDay: isGymDay(dayKey) }
  return { logged: false, workout: nextWorkout(store, dayKey), gymDay: isGymDay(dayKey) }
}

// ---- History and progression ----

// The most recent earlier session that has at least one set of this exercise,
// whichever workout it was in.
export function lastTime(store, exerciseId, beforeDayKey) {
  for (const dayKey of keysBefore(store, beforeDayKey)) {
    const ex = store.sessions[dayKey].exercises.find((e) => e.id === exerciseId)
    if (ex && ex.sets.length > 0) return { dayKey, sets: ex.sets }
  }
  return null
}

// Every set the program called for that day was done, at the top of the rep range
// (or, for a hold, at least as long as its target).
function earnedUp(store, def, last) {
  if (last.sets.length < setCount(store, last.dayKey)) return false
  if (def.kind === 'hold') return last.sets.every((s) => s.seconds >= s.targetSec)
  return last.sets.every((s) => s.reps >= REPS.max)
}

function upWeight(def, sets) {
  const top = Math.max(...sets.map((s) => s.weightLb))
  if (top === 0 && def.firstStepLb) return def.firstStepLb
  return top + INCREMENT_LB[def.kind]
}

const fill = (n, set) => Array.from({ length: n }, () => ({ ...set }))

// What each set starts as on this day. Numbers, with weightLb null for a machine
// that has never been logged. { up, sets, lastDayKey }
export function prefill(store, def, dayKey) {
  const n = setCount(store, dayKey)
  const last = lastTime(store, def.id, dayKey)
  const hold = def.kind === 'hold'
  if (!last) {
    return { up: false, lastDayKey: null, sets: fill(n, hold ? { seconds: def.startSec } : { weightLb: def.startLb, reps: REPS.start }) }
  }
  if (earnedUp(store, def, last)) {
    const sets = hold
      ? fill(n, { seconds: Math.max(...last.sets.map((s) => s.targetSec)) + HOLD_INCREMENT_SEC })
      : fill(n, { weightLb: upWeight(def, last.sets), reps: REPS.afterUp })
    return { up: true, lastDayKey: last.dayKey, sets }
  }
  // Same as last time, set by set. Extra sets copy the last one. A hold that fell short
  // keeps the same target, like a weight that keeps the same pounds.
  const sets = Array.from({ length: n }, (_, i) => {
    const s = last.sets[Math.min(i, last.sets.length - 1)]
    return hold ? { seconds: s.targetSec } : { weightLb: s.weightLb, reps: s.reps }
  })
  return { up: false, lastDayKey: last.dayKey, sets }
}

// ---- Draft: what the Workout screen edits. Numbers are strings, as typed. ----
// { dayKey, workout, byWorkout: { A: [DraftExercise], B: [...] }, walk: { min, done }, restEndsAt }
//   DraftExercise: { id, up, sets: [{ weight, reps, done } | { seconds, target, done }] }

const toDraftSet = (s, done) =>
  'seconds' in s
    ? { seconds: String(s.seconds), target: s.targetSec ?? s.seconds, done }
    : { weight: s.weightLb === null ? '' : String(s.weightLb), reps: String(s.reps), done }

// The exercise list for one workout on one day. A saved session for the same workout
// shows what was saved (as done), followed by any remaining planned sets.
export function buildExercises(store, dayKey, workout) {
  const saved = store.sessions[dayKey]
  const savedById = saved?.workout === workout ? new Map(saved.exercises.map((e) => [e.id, e])) : new Map()
  const listed = WORKOUTS[workout].map((def) => {
    const pf = prefill(store, def, dayKey)
    const done = (savedById.get(def.id)?.sets ?? []).map((s) => toDraftSet(s, true))
    const rest = pf.sets.slice(done.length).map((s) => toDraftSet(s, false))
    return { id: def.id, up: pf.up, sets: [...done, ...rest] }
  })
  // Exercises saved earlier but since removed from the program are kept, not dropped.
  const ids = new Set(WORKOUTS[workout].map((d) => d.id))
  const retired = [...savedById.values()]
    .filter((e) => !ids.has(e.id))
    .map((e) => ({ id: e.id, up: false, sets: e.sets.map((s) => toDraftSet(s, true)) }))
  return [...listed, ...retired]
}

export function buildDraft(store, dayKey, workout = workoutForDay(store, dayKey)) {
  const saved = store.sessions[dayKey]
  return {
    dayKey,
    workout,
    byWorkout: { [workout]: buildExercises(store, dayKey, workout) },
    walk: saved
      ? { min: String(saved.walkMin ?? WALK_MINUTES), done: saved.walkMin !== null }
      : { min: String(WALK_MINUTES), done: false },
    restEndsAt: null,
  }
}

// Switches today's workout, keeping anything already tapped in either one.
export const switchWorkout = (store, draft, workout) => ({
  ...draft,
  workout,
  byWorkout: draft.byWorkout[workout] ? draft.byWorkout : { ...draft.byWorkout, [workout]: buildExercises(store, draft.dayKey, workout) },
})

const parseWhole = (text, max) => {
  const t = String(text).trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= max ? n : null
}

const parseWeight = (text) => {
  const n = parseAmount(text)
  return n !== null && n <= MAX_WEIGHT_LB ? n : null
}

// The set as it would be stored, or { error, field } explaining the first problem.
export function parseSet(s) {
  if ('seconds' in s) {
    const seconds = parseWhole(s.seconds, MAX_SECONDS)
    return seconds === null ? { error: `enter seconds from 1 to ${MAX_SECONDS}`, field: 'seconds' } : { set: { seconds, targetSec: s.target } }
  }
  const weightLb = parseWeight(s.weight)
  if (weightLb === null) return { error: `enter a weight from 0 to ${MAX_WEIGHT_LB} lb`, field: 'weight' }
  const reps = parseWhole(s.reps, MAX_REPS)
  if (reps === null) return { error: `enter reps from 1 to ${MAX_REPS}`, field: 'reps' }
  return { set: { weightLb, reps } }
}

export const draftHasDone = (draft) => draft.walk.done || draft.byWorkout[draft.workout].some((e) => e.sets.some((s) => s.done))

// Turns the draft into a stored session: only Done sets, only exercises with some.
// Returns { ok: true, session } or { ok: false, error, exerciseId, setIndex, field }.
export function sessionFromDraft(draft, existing, now) {
  const exercises = []
  for (const ex of draft.byWorkout[draft.workout]) {
    const sets = []
    for (const [i, s] of ex.sets.entries()) {
      if (!s.done) continue
      const r = parseSet(s)
      if (r.error) return { ok: false, error: `${exerciseName(ex.id)}, set ${i + 1}: ${r.error}.`, exerciseId: ex.id, setIndex: i, field: r.field }
      sets.push(r.set)
    }
    if (sets.length) exercises.push({ id: ex.id, sets })
  }
  let walkMin = null
  if (draft.walk.done) {
    walkMin = parseWhole(draft.walk.min, MAX_WALK_MIN)
    if (walkMin === null) return { ok: false, error: `Walk: enter minutes from 1 to ${MAX_WALK_MIN}.`, exerciseId: 'walk', setIndex: null, field: 'min' }
  }
  if (exercises.length === 0 && walkMin === null) {
    return { ok: false, error: 'Tap Done on at least one set.', exerciseId: null, setIndex: null, field: null }
  }
  const at = now.toISOString()
  return {
    ok: true,
    session: { workout: draft.workout, exercises, walkMin, loggedAt: existing?.loggedAt ?? at, updatedAt: at },
  }
}

// ---- Unsaved taps survive the app being closed between sets. ----

export function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY))
    const ok =
      d &&
      typeof d.dayKey === 'string' &&
      (d.workout === 'A' || d.workout === 'B') &&
      d.byWorkout &&
      Array.isArray(d.byWorkout[d.workout]) &&
      d.walk &&
      typeof d.walk === 'object'
    return ok ? d : null
  } catch {
    return null
  }
}

export function saveDraft(draft) {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else localStorage.removeItem(DRAFT_KEY)
    return true
  } catch {
    return false
  }
}

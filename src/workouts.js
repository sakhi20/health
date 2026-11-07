// Workout sessions live in their own key, separate from the health:v1 log.
// Sessions are keyed by day, using the same 4am boundary (dayKeyFor in day.js).
//
// Stored shape:
// { version: 2, sessions: { "2026-11-03": Session } }
//   Session:  { workout: 'A' | 'B', exercises: [{ id, sets }], walkMin: number | null, loggedAt, updatedAt }
//   Set:      { weightLb, reps, targetReps } for dumbbells and machines
//             { seconds, targetSec } for holds
//   targetReps / targetSec are what was prefilled. Sets logged before targetReps
//   existed don't have it; they were prefilled with REPS.prefill.
// Only sets marked Done are stored; an exercise with none is left out.
// Rest days are not stored: the schedule in program.js decides them.
import { weekdayOf } from './day.js'
import { parseAmount } from './format.js'
import {
  GYM_WEEKDAYS,
  REPS,
  SETS,
  WALK_MINUTES,
  INCREMENT_LB,
  WEIGHT_STEP_MAX_PERCENT,
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

const top = (sets) => Math.max(...sets.map((s) => s.weightLb))
const targetReps = (s) => s.targetReps ?? REPS.prefill

// 'weight' when the increment is a small enough share of last session's top weight,
// otherwise 'reps' (see program.js). Hip thrust's first step from 0 is a weight step.
export function progressionRule(def, sets) {
  const t = top(sets)
  if (t === 0 && def.firstStepLb) return 'weight'
  // In whole percents, so 2.5 lb on 25 lb is exactly 10%, with no rounding.
  return INCREMENT_LB[def.kind] * 100 <= t * WEIGHT_STEP_MAX_PERCENT ? 'weight' : 'reps'
}

const fill = (n, set) => Array.from({ length: n }, () => ({ ...set }))

// What each set starts as on this day. Numbers, with weightLb null for a machine
// that has never been logged. { up, sets, lastDayKey }; up means more weight, reps or time.
export function prefill(store, def, dayKey) {
  const n = SETS
  const last = lastTime(store, def.id, dayKey)
  if (!last) {
    return { up: false, lastDayKey: null, sets: fill(n, def.kind === 'hold' ? { seconds: def.startSec } : { weightLb: def.startLb, reps: REPS.prefill }) }
  }
  // Set by set from last time; sets beyond those logged copy the last one.
  const each = (fn) => Array.from({ length: n }, (_, i) => fn(last.sets[Math.min(i, last.sets.length - 1)]))
  const up = (sets) => ({ up: true, lastDayKey: last.dayKey, sets })
  const same = (sets) => ({ up: false, lastDayKey: last.dayKey, sets })

  // A hold: every logged hold reached its target, however many were logged.
  if (def.kind === 'hold') {
    const target = Math.max(...last.sets.map((s) => s.targetSec))
    if (last.sets.every((s) => s.seconds >= s.targetSec)) return up(fill(n, { seconds: target + HOLD_INCREMENT_SEC }))
    return same(each((s) => ({ seconds: s.targetSec })))
  }

  // A lift: anything short (a missing set, or reps under the target) repeats the same numbers.
  const repeat = same(each((s) => ({ weightLb: s.weightLb, reps: targetReps(s) })))
  if (last.sets.length < SETS) return repeat
  const inc = INCREMENT_LB[def.kind]

  if (progressionRule(def, last.sets) === 'weight') {
    if (!last.sets.every((s) => s.reps >= REPS.up)) return repeat
    const t = top(last.sets)
    return up(fill(n, { weightLb: t === 0 && def.firstStepLb ? def.firstStepLb : t + inc, reps: REPS.prefill }))
  }

  if (last.sets.every((s) => s.reps >= REPS.cap)) return up(each((s) => ({ weightLb: s.weightLb + inc, reps: REPS.prefill })))
  if (last.sets.every((s) => s.reps >= targetReps(s))) return up(each((s) => ({ weightLb: s.weightLb, reps: Math.min(targetReps(s) + 1, REPS.cap) })))
  return repeat
}

// ---- Draft: what the Workout screen edits. Numbers are strings, as typed. ----
// { dayKey, workout, byWorkout: { A: [DraftExercise], B: [...] }, walk: { min, done }, restEndsAt }
//   DraftExercise: { id, up, sets: [{ weight, reps, target?, done } | { seconds, target, done }] }
//   target is what was prefilled (reps or seconds).

// A prefilled set, not done yet.
const fromPrefill = (s) =>
  'seconds' in s
    ? { seconds: String(s.seconds), target: s.seconds, done: false }
    : { weight: s.weightLb === null ? '' : String(s.weightLb), reps: String(s.reps), target: s.reps, done: false }

// A saved set, done. Older lift sets have no target, and keep none.
const fromSaved = (s) =>
  'seconds' in s
    ? { seconds: String(s.seconds), target: s.targetSec, done: true }
    : { weight: String(s.weightLb), reps: String(s.reps), ...('targetReps' in s ? { target: s.targetReps } : {}), done: true }

// The exercise list for one workout on one day. A saved session for the same workout
// shows what was saved (as done), followed by any remaining planned sets.
export function buildExercises(store, dayKey, workout) {
  const saved = store.sessions[dayKey]
  const savedById = saved?.workout === workout ? new Map(saved.exercises.map((e) => [e.id, e])) : new Map()
  const listed = WORKOUTS[workout].map((def) => {
    const pf = prefill(store, def, dayKey)
    const done = (savedById.get(def.id)?.sets ?? []).map(fromSaved)
    const rest = pf.sets.slice(done.length).map(fromPrefill)
    return { id: def.id, up: pf.up, sets: [...done, ...rest] }
  })
  // Exercises saved earlier but since removed from the program are kept, not dropped.
  const ids = new Set(WORKOUTS[workout].map((d) => d.id))
  const retired = [...savedById.values()]
    .filter((e) => !ids.has(e.id))
    .map((e) => ({ id: e.id, up: false, sets: e.sets.map(fromSaved) }))
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
  return { set: { weightLb, reps, ...(Number.isInteger(s.target) ? { targetReps: s.target } : {}) } }
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

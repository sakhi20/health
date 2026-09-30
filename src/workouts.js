// Workouts live in their own key, separate from the health:v1 log.
// Day keys use the same 4am boundary (dayKeyFor in day.js).
//
// Stored shape:
// { version: 1, days: { "2026-09-28": Workout | RestDay } }
//   Workout: { status: 'workout', split, exercises: [{ exerciseId, skipped, sets }], loggedAt, updatedAt }
//   RestDay: { status: 'rest', loggedAt, updatedAt }
//   Set:     { weightLb, reps } for weights, { band, reps } for bands
// A day with no key has nothing logged, which is different from a rest day.
import { EXERCISES, SPLITS, BAND_LEVELS } from './exercises.js'
import { parseAmount } from './format.js'

export const WORKOUTS_KEY = 'health:workouts'
export const DRAFT_KEY = 'health:workoutDraft'
export const MAX_REPS = 1000
export const MAX_WEIGHT_LB = 2000

export const emptyWorkouts = () => ({ version: 1, days: {} })

export function loadWorkouts() {
  let raw
  try {
    raw = localStorage.getItem(WORKOUTS_KEY)
  } catch {
    return emptyWorkouts()
  }
  if (!raw) return emptyWorkouts()
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version === 1 && parsed.days && typeof parsed.days === 'object') return parsed
  } catch {
    // fall through
  }
  // Unreadable: keep a copy rather than letting the next save overwrite it.
  try {
    localStorage.setItem(`${WORKOUTS_KEY}:corrupt:${Date.now()}`, raw)
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

export const exerciseName = (id) => EXERCISES[id]?.name ?? id

// 'weight' or 'band'. For an id no longer in the list, go by how it was logged.
export function exerciseKind(id, sets = []) {
  if (EXERCISES[id]) return EXERCISES[id].kind
  return sets.some((s) => s.band) ? 'band' : 'weight'
}

// null (nothing logged), { status: 'rest' } or { status: 'workout', split }
export function dayStatus(store, dayKey) {
  const day = store.days[dayKey]
  if (!day) return null
  return day.status === 'rest' ? { status: 'rest' } : { status: 'workout', split: day.split }
}

// The most recent earlier day on which this exercise was done (not skipped).
export function lastSession(store, exerciseId, beforeDayKey) {
  const keys = Object.keys(store.days)
    .filter((k) => k < beforeDayKey)
    .sort()
    .reverse()
  for (const dayKey of keys) {
    const day = store.days[dayKey]
    if (day.status !== 'workout') continue
    const ex = day.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped && e.sets.length > 0)
    if (ex) return { dayKey, sets: ex.sets }
  }
  return null
}

// ---- Draft: what the Workout screen edits. Numbers are strings, as typed. ----

export const blankSet = (kind) => (kind === 'band' ? { band: null, reps: '' } : { weight: '', reps: '' })

function toDraftSet(set, kind) {
  if (kind === 'band') return { band: BAND_LEVELS.includes(set.band) ? set.band : null, reps: String(set.reps) }
  return { weight: typeof set.weightLb === 'number' ? String(set.weightLb) : '', reps: String(set.reps) }
}

function prefilled(store, exerciseId, dayKey) {
  const kind = exerciseKind(exerciseId)
  const last = lastSession(store, exerciseId, dayKey)
  return {
    exerciseId,
    skipped: false,
    sets: last ? last.sets.map((s) => toDraftSet(s, kind)) : [blankSet(kind)],
    lastDayKey: last?.dayKey ?? null,
  }
}

// The exercise list for a split on a day. If that day already has a saved workout for
// this split, it shows what was saved; otherwise each exercise is prefilled from its
// last session, or gets one empty set the first time.
export function buildExercises(store, dayKey, split) {
  const saved = store.days[dayKey]
  const ids = SPLITS[split].exercises
  if (saved?.status !== 'workout' || saved.split !== split) return ids.map((id) => prefilled(store, id, dayKey))

  const fromSaved = (ex) => {
    const kind = exerciseKind(ex.exerciseId, ex.sets)
    // A skipped exercise keeps prefilled sets underneath, in case it's un-skipped.
    const base = ex.skipped ? prefilled(store, ex.exerciseId, dayKey) : null
    return {
      exerciseId: ex.exerciseId,
      skipped: ex.skipped,
      sets: ex.skipped ? base.sets : ex.sets.map((s) => toDraftSet(s, kind)),
      lastDayKey: base?.lastDayKey ?? null,
    }
  }
  const savedById = new Map(saved.exercises.map((e) => [e.exerciseId, e]))
  const listed = ids.map((id) => (savedById.has(id) ? fromSaved(savedById.get(id)) : prefilled(store, id, dayKey)))
  // Exercises saved earlier but since removed from the list are kept, not dropped.
  const retired = saved.exercises.filter((e) => !ids.includes(e.exerciseId)).map(fromSaved)
  return [...listed, ...retired]
}

const parseReps = (text) => {
  const t = String(text).trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= MAX_REPS ? n : null
}

const parseWeight = (text) => {
  const n = parseAmount(text)
  return n !== null && n <= MAX_WEIGHT_LB ? n : null
}

// Turns an edited exercise list into a stored workout, or explains the first problem.
// Returns { ok: true, workout } or { ok: false, error, exerciseId, setIndex, field }.
export function draftToWorkout(exercises, split, existing, now) {
  const out = []
  for (const ex of exercises) {
    if (ex.skipped) {
      out.push({ exerciseId: ex.exerciseId, skipped: true, sets: [] })
      continue
    }
    const kind = exerciseKind(ex.exerciseId, ex.sets)
    const name = exerciseName(ex.exerciseId)
    if (ex.sets.length === 0) {
      return { ok: false, error: `${name}: add a set or skip it.`, exerciseId: ex.exerciseId, setIndex: 0, field: null }
    }
    const sets = []
    for (const [i, s] of ex.sets.entries()) {
      const fail = (field, what) => ({ ok: false, error: `${name}, set ${i + 1}: ${what}.`, exerciseId: ex.exerciseId, setIndex: i, field })
      if (kind === 'band') {
        if (!BAND_LEVELS.includes(s.band)) return fail('band', 'choose light, medium or heavy')
      } else if (parseWeight(s.weight) === null) {
        return fail('weight', `enter a weight from 0 to ${MAX_WEIGHT_LB} lb`)
      }
      const reps = parseReps(s.reps)
      if (reps === null) return fail('reps', `enter reps as a whole number from 1 to ${MAX_REPS}`)
      sets.push(kind === 'band' ? { band: s.band, reps } : { weightLb: parseWeight(s.weight), reps })
    }
    out.push({ exerciseId: ex.exerciseId, skipped: false, sets })
  }
  if (!out.some((e) => !e.skipped)) {
    return { ok: false, error: 'Every exercise is skipped. Log at least one, or save a rest day instead.', exerciseId: null, setIndex: null, field: null }
  }
  const at = now.toISOString()
  return {
    ok: true,
    workout: { status: 'workout', split, exercises: out, loggedAt: existing?.loggedAt ?? at, updatedAt: at },
  }
}

export const restDay = (existing, now) => {
  const at = now.toISOString()
  return { status: 'rest', loggedAt: existing?.loggedAt ?? at, updatedAt: at }
}

export const putDay = (store, dayKey, value) => ({ ...store, days: { ...store.days, [dayKey]: value } })

export function removeDay(store, dayKey) {
  const days = { ...store.days }
  delete days[dayKey]
  return { ...store, days }
}

// ---- Unsaved edits survive the app being closed between sets. ----
// { dayKey, choice: 'push' | 'pull' | 'legs' | 'rest' | null, bySplit: { push: [...] } }

export function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY))
    return d && typeof d.dayKey === 'string' && d.bySplit && typeof d.bySplit === 'object' ? d : null
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

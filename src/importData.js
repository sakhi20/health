// Parsing, validation, preview and merge for imported export files.
// Pure functions: nothing here touches storage.
import { isValidProteinTarget, isValidWaterTarget, isValidQuickItem } from './settings.js'
import { SPLITS, BAND_LEVELS } from './exercises.js'
import { MAX_REPS, MAX_WEIGHT_LB } from './workouts.js'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY_FIELDS = ['bedtime', 'wakeTime', 'energy']

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const isGrams = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0

function entryProblem(e) {
  if (!isObject(e)) return 'is not an object'
  if (typeof e.id !== 'string' || e.id === '') return 'has no id'
  if (!isIso(e.loggedAt)) return 'has an invalid loggedAt timestamp'
  if (e.type === 'food') {
    if (typeof e.name !== 'string' || e.name.trim() === '') return 'is food with no name'
    if (!isGrams(e.proteinG)) return 'is food with an invalid protein amount'
    return null
  }
  if (e.type === 'water') {
    if (typeof e.ml !== 'number' || !Number.isFinite(e.ml) || e.ml <= 0) return 'is water with an invalid ml amount'
    return null
  }
  return `has unknown type "${e.type}"`
}

function fieldProblem(name, f) {
  if (f === null) return null
  if (!isObject(f)) return 'is not an object or null'
  if (!isIso(f.setAt)) return 'has an invalid setAt timestamp'
  if (name === 'energy') return Number.isInteger(f.value) && f.value >= 1 && f.value <= 5 ? null : 'is not 1 to 5'
  return typeof f.value === 'string' && HH_MM.test(f.value) ? null : 'is not a HH:MM time'
}

function settingsProblem(s) {
  if (!isObject(s)) return 'is not an object'
  if (s.version !== 1) return `has unsupported version ${JSON.stringify(s.version)}`
  if (!isValidProteinTarget(s.proteinTargetG)) return 'has an invalid protein target'
  if (!isValidWaterTarget(s.waterTargetBottles)) return 'has an invalid water target'
  if (!Array.isArray(s.quickAdd)) return 'has no quick add list'
  const ids = new Set()
  for (const [i, q] of s.quickAdd.entries()) {
    if (!isValidQuickItem(q) || typeof q.id !== 'string' || q.id === '') return `quick add item ${i + 1} is invalid`
    if (ids.has(q.id)) return `quick add id ${q.id} appears more than once`
    ids.add(q.id)
  }
  return null
}

function setProblem(s) {
  if (!isObject(s)) return 'is not an object'
  if (!Number.isInteger(s.reps) || s.reps < 1 || s.reps > MAX_REPS) return 'has invalid reps'
  const hasWeight = 'weightLb' in s
  const hasBand = 'band' in s
  if (hasWeight === hasBand) return 'needs either a weight or a band'
  if (hasWeight && (typeof s.weightLb !== 'number' || !Number.isFinite(s.weightLb) || s.weightLb < 0 || s.weightLb > MAX_WEIGHT_LB)) {
    return 'has an invalid weight'
  }
  if (hasBand && !BAND_LEVELS.includes(s.band)) return 'has an invalid band'
  return null
}

function workoutDayProblem(day) {
  if (!isObject(day)) return 'is not an object'
  if (!isIso(day.loggedAt) || !isIso(day.updatedAt)) return 'has an invalid timestamp'
  if (day.status === 'rest') return null
  if (day.status !== 'workout') return `has unknown status ${JSON.stringify(day.status)}`
  if (!(day.split in SPLITS)) return `has unknown split ${JSON.stringify(day.split)}`
  if (!Array.isArray(day.exercises)) return 'has no exercise list'
  const seen = new Set()
  for (const [i, ex] of day.exercises.entries()) {
    if (!isObject(ex) || typeof ex.exerciseId !== 'string' || ex.exerciseId === '') return `exercise ${i + 1} has no id`
    if (seen.has(ex.exerciseId)) return `lists ${ex.exerciseId} twice`
    seen.add(ex.exerciseId)
    if (typeof ex.skipped !== 'boolean' || !Array.isArray(ex.sets)) return `exercise ${ex.exerciseId} is malformed`
    for (const [j, set] of ex.sets.entries()) {
      const problem = setProblem(set)
      if (problem) return `${ex.exerciseId}, set ${j + 1} ${problem}`
    }
  }
  return null
}

function cleanWorkoutDay(day) {
  if (day.status === 'rest') return { status: 'rest', loggedAt: day.loggedAt, updatedAt: day.updatedAt }
  return {
    status: 'workout',
    split: day.split,
    exercises: day.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      skipped: ex.skipped,
      sets: ex.sets.map((s) => ('band' in s ? { band: s.band, reps: s.reps } : { weightLb: s.weightLb, reps: s.reps })),
    })),
    loggedAt: day.loggedAt,
    updatedAt: day.updatedAt,
  }
}

// Returns { ok: true, data, settings, workouts } with exportedAt stripped, or { ok: false, error }.
// settings and workouts are null when the file has none (older exports).
export function parseImport(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }
  if (!isObject(parsed)) return { ok: false, error: 'This file is not a health export.' }
  if (parsed.version !== 1) {
    return { ok: false, error: `Unsupported version: ${JSON.stringify(parsed.version)}. Expected 1.` }
  }
  if (!isObject(parsed.days)) return { ok: false, error: 'This file has no "days" object.' }

  const seenIds = new Set()
  for (const [key, day] of Object.entries(parsed.days)) {
    if (!DAY_KEY.test(key)) return { ok: false, error: `Day "${key}" is not a YYYY-MM-DD date.` }
    if (!isObject(day) || !Array.isArray(day.entries)) return { ok: false, error: `Day ${key} has no entries list.` }
    for (const [i, e] of day.entries.entries()) {
      const problem = entryProblem(e)
      if (problem) return { ok: false, error: `Day ${key}, entry ${i + 1} ${problem}.` }
      if (seenIds.has(e.id)) return { ok: false, error: `Entry id ${e.id} appears more than once.` }
      seenIds.add(e.id)
    }
    for (const name of DAY_FIELDS) {
      if (!(name in day)) return { ok: false, error: `Day ${key} is missing ${name}.` }
      const problem = fieldProblem(name, day[name])
      if (problem) return { ok: false, error: `Day ${key}, ${name} ${problem}.` }
    }
  }

  let settings = null
  if ('settings' in parsed) {
    const problem = settingsProblem(parsed.settings)
    if (problem) return { ok: false, error: `Settings ${problem}.` }
    const { version, proteinTargetG, waterTargetBottles, quickAdd } = parsed.settings
    settings = {
      version,
      proteinTargetG,
      waterTargetBottles,
      quickAdd: quickAdd.map((q) => ({ id: q.id, name: q.name.trim(), proteinG: q.proteinG })),
    }
  }

  let workouts = null
  if ('workouts' in parsed) {
    const w = parsed.workouts
    if (!isObject(w) || w.version !== 1 || !isObject(w.days)) return { ok: false, error: 'Workouts are not in the expected format.' }
    for (const [key, day] of Object.entries(w.days)) {
      if (!DAY_KEY.test(key)) return { ok: false, error: `Workout day "${key}" is not a YYYY-MM-DD date.` }
      const problem = workoutDayProblem(day)
      if (problem) return { ok: false, error: `Workout on ${key} ${problem}.` }
    }
    workouts = { version: 1, days: Object.fromEntries(Object.entries(w.days).map(([k, d]) => [k, cleanWorkoutDay(d)])) }
  }

  const days = {}
  for (const [key, day] of Object.entries(parsed.days)) {
    days[key] = {
      entries: day.entries.map((e) =>
        e.type === 'food'
          ? { id: e.id, type: 'food', name: e.name, proteinG: e.proteinG, loggedAt: e.loggedAt }
          : { id: e.id, type: 'water', ml: e.ml, loggedAt: e.loggedAt },
      ),
      bedtime: day.bedtime,
      wakeTime: day.wakeTime,
      energy: day.energy,
    }
  }
  return { ok: true, data: { version: 1, days }, settings, workouts }
}

// A workout day from the file wins only if this device has none, or has an older one.
const takeWorkoutDay = (current, incoming) => !current || Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt)

// null when the file has no workouts.
export function previewWorkouts(current, incoming) {
  if (incoming === null) return null
  const keys = Object.keys(incoming.days)
  return {
    days: keys.length,
    newDays: keys.filter((k) => !current.days[k]).length,
    updatedDays: keys.filter((k) => current.days[k] && takeWorkoutDay(current.days[k], incoming.days[k])).length,
  }
}

export function mergeWorkouts(current, incoming) {
  if (incoming === null) return current
  const days = { ...current.days }
  for (const [key, day] of Object.entries(incoming.days)) if (takeWorkoutDay(days[key], day)) days[key] = day
  return { ...current, days }
}

// Human-readable list of what replacing the current settings would change.
// null: the file has no settings, so they are kept. []: identical.
export function settingsChanges(current, incoming) {
  if (incoming === null) return null
  const changes = []
  if (current.proteinTargetG !== incoming.proteinTargetG) {
    changes.push(`Protein target: ${current.proteinTargetG} g to ${incoming.proteinTargetG} g`)
  }
  if (current.waterTargetBottles !== incoming.waterTargetBottles) {
    changes.push(`Water target: ${current.waterTargetBottles} to ${incoming.waterTargetBottles} bottles`)
  }
  const cur = new Map(current.quickAdd.map((q) => [q.id, q]))
  const inc = new Map(incoming.quickAdd.map((q) => [q.id, q]))
  const added = incoming.quickAdd.filter((q) => !cur.has(q.id)).map((q) => q.name)
  const removed = current.quickAdd.filter((q) => !inc.has(q.id)).map((q) => q.name)
  const edited = incoming.quickAdd
    .filter((q) => cur.has(q.id) && (cur.get(q.id).name !== q.name || cur.get(q.id).proteinG !== q.proteinG))
    .map((q) => q.name)
  if (added.length) changes.push(`Quick add, added: ${added.join(', ')}`)
  if (removed.length) changes.push(`Quick add, removed: ${removed.join(', ')}`)
  if (edited.length) changes.push(`Quick add, edited: ${edited.join(', ')}`)
  const sharedOrder = (list, other) => list.filter((q) => other.has(q.id)).map((q) => q.id).join()
  if (sharedOrder(current.quickAdd, inc) !== sharedOrder(incoming.quickAdd, cur)) changes.push('Quick add order changed')
  return changes
}

const allIds = (data) => new Set(Object.values(data.days).flatMap((d) => d.entries.map((e) => e.id)))

// A field from the file wins only if the current one is unset or was set earlier.
const takeIncoming = (current, incoming) =>
  incoming !== null && (current === null || Date.parse(incoming.setAt) > Date.parse(current.setAt))

export function previewImport(current, incoming) {
  const existing = allIds(current)
  const days = Object.keys(incoming.days)
  const entries = Object.values(incoming.days).flatMap((d) => d.entries)
  let fieldsUpdated = 0
  for (const [key, day] of Object.entries(incoming.days)) {
    const cur = current.days[key]
    for (const name of DAY_FIELDS) if (takeIncoming(cur?.[name] ?? null, day[name])) fieldsUpdated++
  }
  return {
    days: days.length,
    entries: entries.length,
    newDays: days.filter((k) => !(k in current.days)).length,
    newEntries: entries.filter((e) => !existing.has(e.id)).length,
    fieldsUpdated,
  }
}

export function mergeData(current, incoming) {
  const existing = allIds(current)
  const days = { ...current.days }
  for (const [key, inDay] of Object.entries(incoming.days)) {
    const cur = days[key] ?? { entries: [], bedtime: null, wakeTime: null, energy: null }
    const next = { ...cur, entries: [...cur.entries, ...inDay.entries.filter((e) => !existing.has(e.id))] }
    for (const name of DAY_FIELDS) if (takeIncoming(cur[name], inDay[name])) next[name] = inDay[name]
    const empty = next.entries.length === 0 && DAY_FIELDS.every((n) => next[n] === null)
    if (!empty) days[key] = next
  }
  return { ...current, days }
}

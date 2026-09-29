// Parsing, validation, preview and merge for imported export files.
// Pure functions: nothing here touches storage.

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

// Returns { ok: true, data } with exportedAt stripped, or { ok: false, error }.
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
  return { ok: true, data: { version: 1, days } }
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

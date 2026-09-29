// Settings live in their own key, separate from the health:v1 log data.
// Everything here is pure except loadSettings/saveSettings.
import { newId } from './storage.js'

export const SETTINGS_KEY = 'health:settings'

export const PROTEIN_TARGET_MAX = 500
export const WATER_TARGET_MAX = 20

export const defaultSettings = () => ({
  version: 1,
  proteinTargetG: 80,
  waterTargetBottles: 3,
  quickAdd: [
    { id: 'qa-chana', name: 'Roasted chana', proteinG: 6 },
    { id: 'qa-peanuts', name: 'Peanuts', proteinG: 6 },
    { id: 'qa-yogurt', name: 'Greek yogurt', proteinG: 15 },
    { id: 'qa-whey', name: 'Whey scoop', proteinG: 24 },
  ],
})

const isGrams = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0

export const isValidProteinTarget = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= PROTEIN_TARGET_MAX
export const isValidWaterTarget = (v) => Number.isInteger(v) && v >= 1 && v <= WATER_TARGET_MAX
export const isValidQuickItem = (item) =>
  item !== null && typeof item === 'object' && typeof item.name === 'string' && item.name.trim() !== '' && isGrams(item.proteinG)

// Keeps every valid field from stored settings and falls back to defaults for the rest,
// so one bad value never wipes the whole list.
export function normalizeSettings(raw) {
  const defaults = defaultSettings()
  if (raw === null || typeof raw !== 'object') return defaults
  const seen = new Set()
  const quickAdd = Array.isArray(raw.quickAdd)
    ? raw.quickAdd
        .filter((q) => isValidQuickItem(q) && typeof q.id === 'string' && !seen.has(q.id) && seen.add(q.id))
        .map((q) => ({ id: q.id, name: q.name.trim(), proteinG: q.proteinG }))
    : defaults.quickAdd
  return {
    version: 1,
    proteinTargetG: isValidProteinTarget(raw.proteinTargetG) ? raw.proteinTargetG : defaults.proteinTargetG,
    waterTargetBottles: isValidWaterTarget(raw.waterTargetBottles) ? raw.waterTargetBottles : defaults.waterTargetBottles,
    quickAdd,
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? normalizeSettings(JSON.parse(raw)) : defaultSettings()
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

// Each updater returns the settings unchanged when the input is invalid.

export const setProteinTarget = (s, value) => (isValidProteinTarget(value) ? { ...s, proteinTargetG: value } : s)

export const setWaterTarget = (s, value) => (isValidWaterTarget(value) ? { ...s, waterTargetBottles: value } : s)

export function addQuickItem(s, { name, proteinG }, id = newId()) {
  const item = { id, name: typeof name === 'string' ? name.trim() : name, proteinG }
  return isValidQuickItem(item) ? { ...s, quickAdd: [...s.quickAdd, item] } : s
}

export function updateQuickItem(s, id, { name, proteinG }) {
  const item = { id, name: typeof name === 'string' ? name.trim() : name, proteinG }
  if (!isValidQuickItem(item) || !s.quickAdd.some((q) => q.id === id)) return s
  return { ...s, quickAdd: s.quickAdd.map((q) => (q.id === id ? item : q)) }
}

export const removeQuickItem = (s, id) => ({ ...s, quickAdd: s.quickAdd.filter((q) => q.id !== id) })

export function moveQuickItem(s, from, to) {
  const n = s.quickAdd.length
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return s
  const quickAdd = [...s.quickAdd]
  const [item] = quickAdd.splice(from, 1)
  quickAdd.splice(to, 0, item)
  return { ...s, quickAdd }
}

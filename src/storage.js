const STORAGE_KEY = 'health:v1'
// Duplicated from settings.js to avoid a circular import.
const SETTINGS_KEY = 'health:settings'

export const emptyData = () => ({ version: 1, days: {} })

// A day with nothing in it. Only ever stored once something is actually logged.
export const emptyDay = () => ({ entries: [], bedtime: null, wakeTime: null, energy: null })

export const isDayEmpty = (day) =>
  day.entries.length === 0 && day.bedtime === null && day.wakeTime === null && day.energy === null

// Applies fn to one day's record. A day left with nothing in it is removed,
// so "unlogged" always means "no key", never an empty record.
export function applyDayUpdate(data, dayKey, fn) {
  const current = data.days[dayKey] ?? emptyDay()
  const next = fn({ ...current, entries: [...current.entries] })
  const days = { ...data.days }
  if (isDayEmpty(next)) delete days[dayKey]
  else days[dayKey] = next
  return { ...data, days }
}

export function loadData() {
  let raw
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return emptyData()
  }
  if (!raw) return emptyData()
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.version === 1 && parsed.days && typeof parsed.days === 'object') return parsed
  } catch {
    // fall through
  }
  // Unreadable data: keep a copy rather than letting the next save overwrite it.
  try {
    localStorage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw)
  } catch {
    // nothing more we can do
  }
  return emptyData()
}

// Returns false if the browser refused the write (quota, private mode).
export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

// Returns 'persistent', 'not-persistent', or 'unavailable'.
export async function requestPersistentStorage() {
  // navigator.storage only exists in secure contexts (https or localhost).
  if (!navigator.storage?.persist) return 'unavailable'
  try {
    if (await navigator.storage.persisted()) return 'persistent'
    return (await navigator.storage.persist()) ? 'persistent' : 'not-persistent'
  } catch {
    return 'not-persistent'
  }
}

// Backs up current data (and settings, if they'll be replaced) to their own keys,
// then writes the result. If a backup can't be written, nothing is changed.
// Pass nextSettings = null to leave settings alone.
export function commitImport(current, merged, currentSettings = null, nextSettings = null) {
  const stamp = new Date().toISOString()
  const backupKey = `${STORAGE_KEY}:backup:${stamp}`
  const settingsBackupKey = `${SETTINGS_KEY}:backup:${stamp}`
  try {
    localStorage.setItem(backupKey, JSON.stringify(current))
    if (nextSettings) localStorage.setItem(settingsBackupKey, JSON.stringify(currentSettings))
  } catch {
    return { ok: false, error: "Couldn't write a backup of your current data, so nothing was imported." }
  }
  if (nextSettings && !writeJson(SETTINGS_KEY, nextSettings)) {
    return { ok: false, error: `Couldn't save the imported settings. Nothing was changed (backup at ${backupKey}).` }
  }
  if (!saveData(merged)) {
    if (nextSettings) writeJson(SETTINGS_KEY, currentSettings)
    return { ok: false, error: `Couldn't save the imported data. Nothing was changed (backup at ${backupKey}).` }
  }
  return { ok: true, backupKey, settingsBackupKey: nextSettings ? settingsBackupKey : null }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

// Still version 1: settings is an extra top-level field that older imports ignore.
export const toExportJson = (data, settings) =>
  JSON.stringify({ ...data, ...(settings ? { settings } : {}), exportedAt: new Date().toISOString() }, null, 2)

// Resolves true once the file was handed to the share sheet or download,
// false if the person cancelled the share sheet.
export async function exportData(data, settings) {
  const d = new Date()
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const filename = `health-export-${localDate}.json`
  const json = toExportJson(data, settings)

  // Downloads are unreliable inside an installed iOS home-screen app; the share sheet
  // offers "Save to Files" instead.
  if (isStandalone()) {
    const file = new File([json], filename, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return true
      } catch (err) {
        if (err?.name === 'AbortError') return false
      }
    }
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

// crypto.randomUUID is unavailable over plain http on a LAN IP, so don't rely on it.
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

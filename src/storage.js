const STORAGE_KEY = 'health:v1'

export const emptyData = () => ({ version: 1, days: {} })

// A day with nothing in it. Only ever stored once something is actually logged.
export const emptyDay = () => ({ entries: [], bedtime: null, wakeTime: null, energy: null })

export const isDayEmpty = (day) =>
  day.entries.length === 0 && day.bedtime === null && day.wakeTime === null && day.energy === null

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

// Backs up current data to its own key, then writes the merged result.
// If the backup can't be written, nothing is changed.
export function commitImport(current, merged) {
  const backupKey = `${STORAGE_KEY}:backup:${new Date().toISOString()}`
  try {
    localStorage.setItem(backupKey, JSON.stringify(current))
  } catch {
    return { ok: false, error: "Couldn't write a backup of your current data, so nothing was imported." }
  }
  if (!saveData(merged)) {
    return { ok: false, error: `Couldn't save the imported data. Your previous data is unchanged (backup at ${backupKey}).` }
  }
  return { ok: true, backupKey }
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

export const toExportJson = (data) => JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)

export async function exportData(data) {
  const d = new Date()
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const filename = `health-export-${localDate}.json`
  const json = toExportJson(data)

  // Downloads are unreliable inside an installed iOS home-screen app; the share sheet
  // offers "Save to Files" instead.
  if (isStandalone()) {
    const file = new File([json], filename, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return
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
}

// crypto.randomUUID is unavailable over plain http on a LAN IP, so don't rely on it.
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

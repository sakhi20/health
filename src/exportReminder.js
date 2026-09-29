// When the last export happened. Stored in its own key, outside health:v1.
export const LAST_EXPORT_KEY = 'health:lastExport'
export const EXPORT_OVERDUE_DAYS = 7

export function loadLastExport() {
  try {
    const raw = localStorage.getItem(LAST_EXPORT_KEY)
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null
  } catch {
    return null
  }
}

export function saveLastExport(iso) {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, iso)
    return true
  } catch {
    return false
  }
}

// Whole calendar days between the two local dates, so an export at 11pm
// counts as "1 day ago" the next morning. Calendar dates, not the 4am day.
export function daysSince(iso, now) {
  const then = new Date(iso)
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

// { label, overdue } for display next to the Export button.
export function exportReminder(iso, now) {
  if (iso === null) return { label: 'Never exported', overdue: true }
  const days = daysSince(iso, now)
  const label = days === 0 ? 'Last export: today' : `Last export: ${days} ${days === 1 ? 'day' : 'days'} ago`
  return { label, overdue: days >= EXPORT_OVERDUE_DAYS }
}

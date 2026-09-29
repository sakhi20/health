// A "day" runs from 04:00 local time to 03:59:59 the next morning.
// Days are identified by a key "YYYY-MM-DD" naming the calendar date the day started on.
export const DAY_START_HOUR = 4

const pad = (n) => String(n).padStart(2, '0')

const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Built from local calendar fields rather than subtracting 4h of milliseconds,
// so DST changes can't push a timestamp onto the wrong day.
export function dayKeyFor(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (date.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1)
  return toKey(d)
}

export function shiftDayKey(key, deltaDays) {
  const d = fromKey(key)
  d.setDate(d.getDate() + deltaDays)
  return toKey(d)
}

export function formatDayKey(key) {
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatDayKeyLong(key) {
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// A stored "HH:MM" value in the same 12-hour style as formatTime: "23:30" -> "11:30 PM".
export function formatClock(hhmm, locale = undefined) {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
}

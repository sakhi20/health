// Sleep belongs to the day you wake up: a day's record holds last night's bedtime
// and that morning's wake time. Uses the 4am boundary from day.js unchanged.
import { dayKeyFor, shiftDayKey } from './day.js'

// Tapping "Going to bed" between 4am and noon means a very late night:
// you'll wake up later that same day. Any other time, you wake up on the next day.
export const LATE_NIGHT_END_HOUR = 12

const pad = (n) => String(n).padStart(2, '0')

// Returns { dayKey, value } for a "Going to bed" tap at `now`.
export function goingToBed(now) {
  const today = dayKeyFor(now)
  const h = now.getHours()
  const lateNight = h >= 4 && h < LATE_NIGHT_END_HOUR
  return {
    dayKey: lateNight ? today : shiftDayKey(today, 1),
    value: `${pad(h)}:${pad(now.getMinutes())}`,
  }
}

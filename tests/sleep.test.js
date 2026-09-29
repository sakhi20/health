// Run with TZ=America/New_York (see "npm test").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { goingToBed } from '../src/sleep.js'

test('"Going to bed" files the bedtime under the day you wake up', () => {
  const cases = [
    // [local time of tap, expected record, expected value]
    [new Date(2026, 8, 28, 22, 30), '2026-09-29', '22:30'], // evening: wake tomorrow
    [new Date(2026, 8, 28, 23, 59), '2026-09-29', '23:59'],
    [new Date(2026, 8, 29, 0, 0), '2026-09-29', '00:00'], // after midnight, still day 28: wake on the 29th
    [new Date(2026, 8, 29, 1, 30), '2026-09-29', '01:30'],
    [new Date(2026, 8, 29, 3, 59), '2026-09-29', '03:59'],
    [new Date(2026, 8, 29, 4, 0), '2026-09-29', '04:00'], // after 4am: very late night, wake later today
    [new Date(2026, 8, 29, 6, 15), '2026-09-29', '06:15'],
    [new Date(2026, 8, 29, 11, 59), '2026-09-29', '11:59'],
    [new Date(2026, 8, 29, 12, 0), '2026-09-30', '12:00'], // noon onwards: wake tomorrow
    [new Date(2026, 8, 30, 21, 0), '2026-10-01', '21:00'], // month end
    [new Date(2026, 11, 31, 23, 0), '2027-01-01', '23:00'], // year end
    [new Date(2026, 2, 7, 23, 30), '2026-03-08', '23:30'], // night before US DST starts
    [new Date(2026, 2, 8, 3, 30), '2026-03-08', '03:30'], // 3:30 exists after the 2am jump
    [new Date(2026, 9, 31, 23, 30), '2026-11-01', '23:30'], // night before US DST ends
    [new Date(2026, 10, 1, 1, 30), '2026-11-01', '01:30'], // the repeated hour
  ]
  for (const [now, dayKey, value] of cases) assert.deepEqual(goingToBed(now), { dayKey, value }, now.toString())
})

// The training program. Edit this file to change the workouts, start weights and rules.
//
// Rules, checked by tests/program.test.js:
// - An exercise's `id` is what gets stored. Never rename an id once you've logged it;
//   to fix a display name, change `name` only.
// - kind: 'dumbbell' and 'machine' log pounds and reps per set; 'hold' logs seconds.
//   Dumbbell weights are per dumbbell.
// - startLb: the weight for the very first session. null = no start weight: the field
//   starts empty with the hint "find your weight".
// - firstStepLb (optional): the first increase from 0 lb. After that, the normal
//   increment for the kind applies.
// - note (optional): a short line shown under the exercise name.

// Days of the week, 0 = Sunday ... 6 = Saturday. Tuesday, Thursday, Saturday.
export const GYM_WEEKDAYS = [2, 4, 6]

export const REPS = {
  prefill: 9, // where reps start, and where they go back to after a weight increase
  up: 9, // weight steps: this many or more on every set adds weight next time
  cap: 12, // rep steps: reps climb one a session up to this, then the weight goes up
}

// Each session, every lift picks how it progresses from last session's top weight:
// - weight steps: the increment is at most this percent of that weight. 9+ reps on
//   every set adds the increment next session, reps back to REPS.prefill.
// - rep steps: the increment is more than this percent. Reaching the prefilled reps on
//   every set adds one rep per set next session, up to REPS.cap; REPS.cap on every set
//   adds the increment to each set's weight, reps back to REPS.prefill.
// Either way, falling short of the prefilled reps on any set repeats the same numbers.
export const WEIGHT_STEP_MAX_PERCENT = 10

// Sets per exercise.
export const SETS = 3

export const REST_SECONDS = 90
export const WALK_MINUTES = 10

// How much weight "Up" adds.
export const INCREMENT_LB = { dumbbell: 2.5, machine: 5 }
// How much a hold adds after a session where every hold reached its target.
export const HOLD_INCREMENT_SEC = 5

export const WORKOUTS = {
  A: [
    { id: 'leg-press', name: 'Leg press', kind: 'machine', startLb: null },
    { id: 'dumbbell-bench-press', name: 'Dumbbell bench press', kind: 'dumbbell', startLb: 12.5 },
    { id: 'lat-pulldown', name: 'Lat pulldown', kind: 'machine', startLb: null },
    { id: 'dumbbell-romanian-deadlift', name: 'Dumbbell Romanian deadlift', kind: 'dumbbell', startLb: 15 },
    { id: 'plank', name: 'Plank', kind: 'hold', startSec: 20 },
  ],
  B: [
    { id: 'goblet-squat', name: 'Goblet squat', kind: 'dumbbell', startLb: 15, note: 'One dumbbell' },
    { id: 'chest-press', name: 'Chest press', kind: 'machine', startLb: null },
    { id: 'seated-cable-row', name: 'Seated cable row', kind: 'machine', startLb: null },
    { id: 'dumbbell-shoulder-press', name: 'Dumbbell shoulder press', kind: 'dumbbell', startLb: 7.5 },
    { id: 'hip-thrust', name: 'Hip thrust', kind: 'dumbbell', startLb: 0, firstStepLb: 15, note: 'One dumbbell, 0 = bodyweight' },
    { id: 'leg-curl', name: 'Leg curl', kind: 'machine', startLb: null },
    { id: 'pallof-press', name: 'Pallof press', kind: 'machine', startLb: null, note: 'Cable' },
  ],
}

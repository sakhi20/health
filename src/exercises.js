// The fixed exercise list. Edit this file to change what appears on the Workout screen.
//
// Rules, checked by tests/exercises.test.js:
// - The key is the exercise's permanent id. It is what gets stored, so never rename an
//   id once you've logged it. To fix a display name, change `name` only.
// - kind: 'weight' records pounds per set; 'band' records light, medium or heavy.
// - To retire an exercise, remove it from its split's list below. Keep its entry here,
//   so older workouts still show its name.

export const EXERCISES = {
  'floor-press': { name: 'Floor press', kind: 'weight' },
  'dumbbell-overhead-press': { name: 'Dumbbell overhead press', kind: 'weight' },
  'banded-chest-fly': { name: 'Banded chest fly', kind: 'band' },
  'overhead-tricep-extension': { name: 'Overhead tricep extension', kind: 'weight' },

  'banded-row': { name: 'Banded row', kind: 'band' },
  'single-arm-dumbbell-row': { name: 'Single arm dumbbell row', kind: 'weight' },
  'banded-face-pull': { name: 'Banded face pull', kind: 'band' },
  'dumbbell-curl': { name: 'Dumbbell curl', kind: 'weight' },

  'goblet-squat': { name: 'Goblet squat', kind: 'weight' },
  'romanian-deadlift': { name: 'Romanian deadlift', kind: 'weight' },
  'dumbbell-lunge': { name: 'Dumbbell lunge', kind: 'weight' },
  'hip-thrust': { name: 'Hip thrust', kind: 'weight' },
  'calf-raise': { name: 'Calf raise', kind: 'weight' },
}

// The exercises shown for each split, in order.
export const SPLITS = {
  push: { name: 'Push', exercises: ['floor-press', 'dumbbell-overhead-press', 'banded-chest-fly', 'overhead-tricep-extension'] },
  pull: { name: 'Pull', exercises: ['banded-row', 'single-arm-dumbbell-row', 'banded-face-pull', 'dumbbell-curl'] },
  legs: { name: 'Legs', exercises: ['goblet-squat', 'romanian-deadlift', 'dumbbell-lunge', 'hip-thrust', 'calf-raise'] },
}

export const BAND_LEVELS = ['light', 'medium', 'heavy']

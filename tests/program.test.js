import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WORKOUTS, GYM_WEEKDAYS, INCREMENT_LB, HOLD_INCREMENT_SEC, REPS, SETS } from '../src/program.js'

const all = Object.values(WORKOUTS).flat()

test('two workouts, A and B', () => {
  assert.deepEqual(Object.keys(WORKOUTS), ['A', 'B'])
})

test('ids are unique across both workouts and stable-looking', () => {
  const ids = all.map((e) => e.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[a-z]+(-[a-z]+)*$/)
})

test('every exercise has a valid kind and start value', () => {
  for (const e of all) {
    assert.ok(e.name.trim(), e.id)
    assert.ok(['dumbbell', 'machine', 'hold'].includes(e.kind), e.id)
    if (e.kind === 'hold') assert.ok(Number.isInteger(e.startSec) && e.startSec > 0, e.id)
    else assert.ok(e.startLb === null || (typeof e.startLb === 'number' && e.startLb >= 0), e.id)
    if (e.firstStepLb !== undefined) assert.ok(e.startLb === 0 && e.firstStepLb > 0, e.id)
  }
})

test('rules are sensible', () => {
  assert.ok(GYM_WEEKDAYS.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
  assert.ok(INCREMENT_LB.dumbbell > 0 && INCREMENT_LB.machine > 0 && HOLD_INCREMENT_SEC > 0)
  assert.ok(REPS.min <= REPS.prefill && REPS.prefill <= REPS.max)
  assert.ok(Number.isInteger(SETS) && SETS >= 1)
})

test('the starting program matches what was asked for', () => {
  const brief = (list) => list.map((e) => [e.name, e.kind, e.kind === 'hold' ? e.startSec : e.startLb])
  assert.deepEqual(brief(WORKOUTS.A), [
    ['Leg press', 'machine', null],
    ['Dumbbell bench press', 'dumbbell', 12.5],
    ['Lat pulldown', 'machine', null],
    ['Dumbbell Romanian deadlift', 'dumbbell', 15],
    ['Plank', 'hold', 20],
  ])
  assert.deepEqual(brief(WORKOUTS.B), [
    ['Goblet squat', 'dumbbell', 15],
    ['Seated cable row', 'machine', null],
    ['Dumbbell shoulder press', 'dumbbell', 7.5],
    ['Hip thrust', 'dumbbell', 0],
    ['Leg curl', 'machine', null],
    ['Pallof press', 'machine', null],
  ])
  assert.deepEqual(GYM_WEEKDAYS, [2, 4, 6])
  assert.deepEqual(INCREMENT_LB, { dumbbell: 2.5, machine: 5 })
  assert.equal(SETS, 3)
  assert.equal(REPS.prefill, 9)
})

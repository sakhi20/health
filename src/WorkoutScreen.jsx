import { useEffect, useState } from 'react'
import { formatDayKey, formatDayKeyLong, formatTime } from './day.js'
import { SPLITS, BAND_LEVELS } from './exercises.js'
import {
  buildExercises,
  blankSet,
  draftToWorkout,
  restDay,
  exerciseName,
  exerciseKind,
  lastSession,
  loadDraft,
  saveDraft,
} from './workouts.js'
import { NavBar, LargeTitle, HeaderButton, RowButton, Segmented } from './ui/layout.jsx'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, MinusCircleIcon, WarningIcon, DumbbellIcon } from './ui/icons.jsx'

const CHOICES = [
  ['push', 'Push'],
  ['pull', 'Pull'],
  ['legs', 'Legs'],
  ['rest', 'Rest'],
]
const BAND_NAMES = { light: 'Light', medium: 'Medium', heavy: 'Heavy' }

// The draft for this day: unsaved edits if there are any, otherwise what's saved.
function initialDraft(workouts, dayKey) {
  const stored = loadDraft()
  if (stored?.dayKey === dayKey) return { draft: stored, dirty: true }
  const saved = workouts.days[dayKey]
  if (!saved) return { draft: { dayKey, choice: null, bySplit: {} }, dirty: false }
  if (saved.status === 'rest') return { draft: { dayKey, choice: 'rest', bySplit: {} }, dirty: false }
  return { draft: { dayKey, choice: saved.split, bySplit: { [saved.split]: buildExercises(workouts, dayKey, saved.split) } }, dirty: false }
}

export function WorkoutScreen({ dayKey, workouts, onSave, onRemove, onBack, onDraftChange, scrollRoot, announce }) {
  const [{ draft, dirty }, setState] = useState(() => initialDraft(workouts, dayKey))
  const [error, setError] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const saved = workouts.days[dayKey] ?? null
  const choice = draft.choice
  const exercises = choice && choice !== 'rest' ? draft.bySplit[choice] : null

  // Unsaved edits are kept, so closing the app between sets loses nothing.
  useEffect(() => {
    if (!dirty) return
    saveDraft(draft)
    onDraftChange(draft.dayKey)
  }, [draft, dirty, onDraftChange])

  const edit = (fn) => {
    setError(null)
    setConfirmRemove(false)
    setState((s) => ({ draft: fn(s.draft), dirty: true }))
  }

  const pick = (next) =>
    edit((d) => ({
      ...d,
      choice: next,
      bySplit: next === 'rest' || d.bySplit[next] ? d.bySplit : { ...d.bySplit, [next]: buildExercises(workouts, dayKey, next) },
    }))

  const updateExercise = (id, fn) =>
    edit((d) => ({ ...d, bySplit: { ...d.bySplit, [d.choice]: d.bySplit[d.choice].map((e) => (e.exerciseId === id ? fn(e) : e)) } }))

  const clearDraft = () => {
    saveDraft(null)
    onDraftChange(null)
  }

  const save = () => {
    if (!choice) return
    if (choice === 'rest') {
      onSave(dayKey, restDay(saved, new Date()))
      clearDraft()
      announce(`${formatDayKey(dayKey)} saved as a rest day`)
      onBack()
      return
    }
    const result = draftToWorkout(exercises, choice, saved, new Date())
    if (!result.ok) {
      setError(result.error)
      const target =
        result.field === null
          ? document.getElementById(`add-set-${result.exerciseId}`)
          : document.getElementById(`set-${result.exerciseId}-${result.setIndex}-${result.field}`)
      target?.focus()
      return
    }
    onSave(dayKey, result.workout)
    clearDraft()
    announce(`${SPLITS[choice].name} workout saved`)
    onBack()
  }

  const remove = () => {
    onRemove(dayKey)
    clearDraft()
    setConfirmRemove(false)
    setState({ draft: { dayKey, choice: null, bySplit: {} }, dirty: false })
    announce(`${formatDayKey(dayKey)} set back to not logged`)
  }

  const savedLabel = saved?.status === 'rest' ? 'Rest day' : saved ? `${SPLITS[saved.split]?.name ?? saved.split} workout` : null
  const status = error
    ? null
    : dirty
      ? saved
        ? 'Unsaved changes'
        : 'Not saved yet'
      : saved
        ? `${savedLabel} saved at ${formatTime(saved.updatedAt)}`
        : 'Nothing logged for this day'

  return (
    <div className="flex min-h-dvh flex-col">
      <NavBar
        title="Workout"
        scrollRoot={scrollRoot}
        left={
          <HeaderButton onClick={onBack} className="-ml-1">
            <ChevronLeftIcon size={26} strokeWidth={2.2} />
            Today
          </HeaderButton>
        }
      />
      <LargeTitle eyebrow={formatDayKeyLong(dayKey)}>Workout</LargeTitle>

      <div className="px-4 pt-2">
        <Segmented label="Split" value={choice} onChange={pick} options={CHOICES} />
      </div>

      <div className="flex-1">
        {choice === null && (
          <Message icon title="Pick today’s split">
            Your exercises appear with the sets from your last session filled in. Pick Rest to log a rest day.
          </Message>
        )}
        {choice === 'rest' && <Message title="Rest day">Saves {formatDayKey(dayKey)} as a rest day, with no exercises.</Message>}
        {exercises?.map((ex) => (
          <ExerciseCard key={ex.exerciseId} ex={ex} dayKey={dayKey} workouts={workouts} onChange={(fn) => updateExercise(ex.exerciseId, fn)} />
        ))}

        {saved && (
          <section className="mt-8 px-4">
            <div className="overflow-hidden rounded-[10px] bg-surface">
              {confirmRemove ? (
                <div className="flex items-center gap-2 py-1 pl-4 pr-2">
                  <p className="flex-1 text-[15px]">Remove the {savedLabel.toLowerCase()} for {formatDayKey(dayKey)}?</p>
                  <HeaderButton onClick={() => setConfirmRemove(false)}>Cancel</HeaderButton>
                  <HeaderButton onClick={remove} className="font-semibold text-danger dark:text-[#ff6961]">
                    Remove
                  </HeaderButton>
                </div>
              ) : (
                <RowButton onClick={() => setConfirmRemove(true)} className="justify-center text-danger dark:text-[#ff6961]">
                  Remove {savedLabel}
                </RowButton>
              )}
            </div>
            <p className="px-4 pt-1.5 text-[13px] text-label2">Sets this day back to not logged.</p>
          </section>
        )}
        <div className="h-6" />
      </div>

      {/* Save stays under the thumb, whatever is scrolled into view. */}
      <div className="sticky bottom-0 z-10 border-t border-sep/60 bg-bar px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <p role="status" className={`mb-2 flex min-h-[18px] items-start gap-1.5 text-[13px] ${error ? 'text-danger dark:text-[#ff6961]' : 'text-label2'}`}>
          {error && <WarningIcon size={16} className="mt-px" />}
          <span>{error ?? status}</span>
        </p>
        <button
          type="button"
          onClick={save}
          disabled={!choice}
          className="h-[50px] w-full rounded-xl bg-tint-fill text-[17px] font-semibold text-white transition active:scale-[0.98] active:opacity-90 disabled:bg-fill disabled:text-label3"
        >
          {choice === 'rest' ? 'Save Rest Day' : saved && !dirty ? 'Save Again' : saved ? 'Save Changes' : 'Save Workout'}
        </button>
      </div>
    </div>
  )
}

function Message({ title, children, icon = false }) {
  return (
    <div className="mx-4 mt-6 flex flex-col items-center rounded-[10px] bg-surface px-6 py-6 text-center">
      {icon && <DumbbellIcon size={34} strokeWidth={1.6} className="text-label3" />}
      <p className={`${icon ? 'mt-2' : ''} text-[17px] font-semibold`}>{title}</p>
      <p className="mt-1 text-[15px] text-label2">{children}</p>
    </div>
  )
}

function ExerciseCard({ ex, dayKey, workouts, onChange }) {
  const name = exerciseName(ex.exerciseId)
  const kind = exerciseKind(ex.exerciseId, ex.sets)
  const last = lastSession(workouts, ex.exerciseId, dayKey)
  const sub = ex.skipped ? 'Skipped' : last ? `Last time: ${formatDayKey(last.dayKey)}` : 'First time: enter your sets'

  const setField = (i, field, value) => onChange((e) => ({ ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, [field]: value } : s)) }))
  // A new set starts as a copy of the one before it.
  const addSet = () => onChange((e) => ({ ...e, sets: [...e.sets, e.sets.length ? { ...e.sets.at(-1) } : blankSet(kind)] }))
  const removeSet = (i) => onChange((e) => ({ ...e, sets: e.sets.filter((_, j) => j !== i) }))

  return (
    <section className="mt-7 px-4" aria-label={name}>
      <div className="flex items-end justify-between gap-2 pb-1.5 pl-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug">{name}</h2>
          <p className="text-[13px] text-label2">{sub}</p>
        </div>
        <HeaderButton onClick={() => onChange((e) => ({ ...e, skipped: !e.skipped }))} className="-mb-2 -mr-2 shrink-0 text-[15px]" aria-label={ex.skipped ? `Undo skip ${name}` : `Skip ${name}`}>
          {ex.skipped ? 'Undo Skip' : 'Skip'}
        </HeaderButton>
      </div>
      {!ex.skipped && (
        <div className="overflow-hidden rounded-[10px] bg-surface">
          <div aria-hidden="true" className="flex gap-2 px-4 pb-0.5 pt-2 text-[12px] uppercase tracking-wide text-label2">
            <span className="w-6">Set</span>
            <span className="flex-1">{kind === 'band' ? 'Band' : 'Weight'}</span>
            <span className="w-[5.75rem]">Reps</span>
            <span className="w-11" />
          </div>
          {ex.sets.map((s, i) => {
            const base = `set-${ex.exerciseId}-${i}`
            const label = `${name}, set ${i + 1}`
            return (
              <div key={i} className="grouped-row relative flex items-center gap-2 px-4 py-1.5">
                <span className="w-6 text-[17px] tabular-nums text-label2">{i + 1}</span>
                {kind === 'band' ? (
                  <div className="relative min-w-0 flex-1">
                    <select
                      id={`${base}-band`}
                      value={s.band ?? ''}
                      onChange={(e) => setField(i, 'band', e.target.value || null)}
                      aria-label={`${label}, band`}
                      className={`h-11 w-full appearance-none rounded-lg bg-fill pl-3 pr-8 text-[17px] focus:outline-none focus:ring-2 focus:ring-tint ${s.band ? 'text-label' : 'text-label3'}`}
                    >
                      <option value="">Choose…</option>
                      {BAND_LEVELS.map((b) => (
                        <option key={b} value={b}>
                          {BAND_NAMES[b]}
                        </option>
                      ))}
                    </select>
                    <ChevronRightIcon size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-label3" />
                  </div>
                ) : (
                  <NumberField id={`${base}-weight`} value={s.weight} onChange={(v) => setField(i, 'weight', v)} unit="lb" mode="decimal" label={`${label}, weight in pounds`} className="flex-1" />
                )}
                <NumberField id={`${base}-reps`} value={s.reps} onChange={(v) => setField(i, 'reps', v)} unit="reps" mode="numeric" label={`${label}, reps`} className="w-[5.75rem]" />
                <button
                  type="button"
                  onClick={() => removeSet(i)}
                  disabled={ex.sets.length === 1}
                  aria-label={`Remove ${label}`}
                  className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-danger disabled:text-label3 dark:text-[#ff6961] dark:disabled:text-label3"
                >
                  <MinusCircleIcon size={22} />
                </button>
              </div>
            )
          })}
          <RowButton id={`add-set-${ex.exerciseId}`} onClick={addSet} className="text-tint">
            <PlusIcon size={20} />
            Add Set
          </RowButton>
        </div>
      )}
    </section>
  )
}

function NumberField({ id, value, onChange, unit, mode, label, className = '' }) {
  return (
    <label htmlFor={id} className={`flex h-11 min-w-0 items-center gap-1 rounded-lg bg-fill px-2.5 focus-within:ring-2 focus-within:ring-tint ${className}`}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Select on focus so typing replaces the prefilled number.
        onFocus={(e) => {
          const el = e.target
          requestAnimationFrame(() => el.select())
        }}
        inputMode={mode}
        pattern={mode === 'numeric' ? '[0-9]*' : undefined}
        enterKeyHint="done"
        autoComplete="off"
        aria-label={label}
        className="h-full w-full min-w-0 bg-transparent text-right text-[17px] tabular-nums focus:outline-none"
      />
      <span aria-hidden="true" className="text-[15px] text-label2">
        {unit}
      </span>
    </label>
  )
}

import { useEffect, useState } from 'react'
import { formatDayKey, formatDayKeyLong, formatTime } from './day.js'
import { formatNumber } from './format.js'
import { GYM_WEEKDAYS, REST_SECONDS, WORKOUTS } from './program.js'
import {
  buildDraft,
  switchWorkout,
  sessionFromDraft,
  draftHasDone,
  parseSet,
  prefill,
  exerciseDef,
  exerciseName,
  isGymDay,
  nextWorkout,
  removeSession,
  loadDraft,
  saveDraft,
} from './workouts.js'
import { NavBar, HeaderButton, RowButton, Segmented } from './ui/layout.jsx'
import { ChevronLeftIcon, WarningIcon, CheckIcon, MoonIcon } from './ui/icons.jsx'

const WORKOUT_OPTIONS = [
  ['A', 'A'],
  ['B', 'B'],
]

// Unsaved taps for this day if there are any, otherwise the saved session or a fresh prefill.
function initialState(workouts, dayKey) {
  const stored = loadDraft()
  if (stored?.dayKey === dayKey) return { draft: stored, dirty: true, logging: true }
  return { draft: buildDraft(workouts, dayKey), dirty: false, logging: isGymDay(dayKey) || Boolean(workouts.sessions[dayKey]) }
}

export function WorkoutScreen({ dayKey, workouts, onSave, onRemove, onBack, onDraftChange, scrollRoot, announce }) {
  const [{ draft, dirty, logging }, setState] = useState(() => initialState(workouts, dayKey))
  const [error, setError] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const saved = workouts.sessions[dayKey] ?? null
  const exercises = draft.byWorkout[draft.workout]

  // Unsaved taps are kept, so closing the app between sets loses nothing.
  useEffect(() => {
    if (!dirty) return
    saveDraft(draft)
    onDraftChange(draft.dayKey)
  }, [draft, dirty, onDraftChange])

  const restLeft = draft.restEndsAt ? Math.min(REST_SECONDS, Math.ceil((draft.restEndsAt - now) / 1000)) : 0
  useEffect(() => {
    if (restLeft <= 0) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [restLeft > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (fn) => {
    setError(null)
    setConfirmRemove(false)
    setState((s) => ({ ...s, draft: fn(s.draft), dirty: true }))
  }

  const changeSet = (d, exId, i, fn) => ({
    ...d,
    byWorkout: {
      ...d.byWorkout,
      [d.workout]: d.byWorkout[d.workout].map((e) => (e.id === exId ? { ...e, sets: e.sets.map((s, j) => (j === i ? fn(s) : s)) } : e)),
    },
  })

  const setField = (exId, i, field, value) => edit((d) => changeSet(d, exId, i, (s) => ({ ...s, [field]: value })))

  const toggleDone = (exId, i, done) => {
    const t = Date.now()
    setNow(t)
    edit((d) => ({ ...changeSet(d, exId, i, (s) => ({ ...s, done })), restEndsAt: done ? t + REST_SECONDS * 1000 : d.restEndsAt }))
  }

  const pickWorkout = (w) => edit((d) => switchWorkout(workouts, d, w))
  const setWalk = (patch) => edit((d) => ({ ...d, walk: { ...d.walk, ...patch } }))
  const dismissRest = () => edit((d) => ({ ...d, restEndsAt: null }))
  const logAnyway = () => setState((s) => ({ ...s, logging: true }))

  const clearDraft = () => {
    saveDraft(null)
    onDraftChange(null)
  }

  const finish = () => {
    const result = sessionFromDraft(draft, saved, new Date())
    if (!result.ok) {
      setError(result.error)
      const id = result.exerciseId === 'walk' ? 'walk-min' : `set-${result.exerciseId}-${result.setIndex}-${result.field}`
      document.getElementById(id)?.focus()
      return
    }
    onSave(dayKey, result.session)
    clearDraft()
    announce(`Workout ${draft.workout} saved`)
    onBack()
  }

  const remove = () => {
    const rest = removeSession(workouts, dayKey)
    onRemove(dayKey)
    clearDraft()
    setConfirmRemove(false)
    setState({ draft: buildDraft(rest, dayKey), dirty: false, logging: isGymDay(dayKey) })
    announce(`Workout for ${formatDayKey(dayKey)} removed`)
  }

  const back = (
    <HeaderButton onClick={onBack} className="-ml-1">
      <ChevronLeftIcon size={26} strokeWidth={2.2} />
      Today
    </HeaderButton>
  )

  if (!logging) return <RestDay dayKey={dayKey} workouts={workouts} back={back} scrollRoot={scrollRoot} onLogAnyway={logAnyway} />

  const allSets = exercises.flatMap((e) => e.sets)
  const doneSets = allSets.filter((s) => s.done).length
  const status = error
    ? null
    : saved && !dirty
      ? `Saved at ${formatTime(saved.updatedAt)}`
      : `${doneSets} of ${allSets.length} sets done${draft.walk.done ? ', walk done' : ''}`

  return (
    <div className="flex min-h-dvh flex-col">
      <NavBar title={`Workout ${draft.workout}`} scrollRoot={scrollRoot} left={back} />
      <header className="flex items-end justify-between gap-4 px-4 pb-2 pt-1">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-label2">{formatDayKeyLong(dayKey)}</p>
          <h1 className="text-[34px] font-bold leading-[41px] tracking-tight">Workout {draft.workout}</h1>
        </div>
        <div className="mb-0.5 w-24 shrink-0">
          <Segmented label="Today’s workout" value={draft.workout} onChange={pickWorkout} options={WORKOUT_OPTIONS} />
        </div>
      </header>

      {restLeft > 0 && <RestTimer left={restLeft} onDismiss={dismissRest} />}

      <div className="flex-1">
        {exercises.map((ex) => (
          <ExerciseCard key={ex.id} ex={ex} onField={(i, f, v) => setField(ex.id, i, f, v)} onDone={(i, done) => toggleDone(ex.id, i, done)} />
        ))}

        <section className="mt-6 px-4" aria-label="Walk">
          <h2 className="pb-1.5 pl-4 text-[17px] font-semibold leading-snug">Walk</h2>
          <div className="flex items-center gap-2 rounded-[10px] bg-surface px-4 py-1.5">
            <NumberField id="walk-min" value={draft.walk.min} onChange={(v) => setWalk({ min: v })} unit="min" mode="numeric" label="Walk, minutes" className="flex-1" />
            <DoneButton done={draft.walk.done} disabled={false} label="Walk" onClick={() => setWalk({ done: !draft.walk.done })} />
          </div>
        </section>

        {saved && (
          <section className="mt-8 px-4">
            <div className="overflow-hidden rounded-[10px] bg-surface">
              {confirmRemove ? (
                <div className="flex items-center gap-2 py-1 pl-4 pr-2">
                  <p className="flex-1 text-[15px]">Remove the workout for {formatDayKey(dayKey)}?</p>
                  <HeaderButton onClick={() => setConfirmRemove(false)}>Cancel</HeaderButton>
                  <HeaderButton onClick={remove} className="font-semibold text-danger dark:text-[#ff6961]">
                    Remove
                  </HeaderButton>
                </div>
              ) : (
                <RowButton onClick={() => setConfirmRemove(true)} className="justify-center text-danger dark:text-[#ff6961]">
                  Remove Workout
                </RowButton>
              )}
            </div>
          </section>
        )}
        <div className="h-6" />
      </div>

      {/* Finish stays under the thumb, whatever is scrolled into view. */}
      <div className="sticky bottom-0 z-10 border-t border-sep/60 bg-bar px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <p role="status" className={`mb-2 flex min-h-[18px] items-start gap-1.5 text-[13px] ${error ? 'text-danger dark:text-[#ff6961]' : 'text-label2'}`}>
          {error && <WarningIcon size={16} className="mt-px" />}
          <span>{error ?? status}</span>
        </p>
        <button
          type="button"
          onClick={finish}
          disabled={!draftHasDone(draft)}
          className="h-[50px] w-full rounded-xl bg-tint-fill text-[17px] font-semibold text-white transition active:scale-[0.98] active:opacity-90 disabled:bg-fill disabled:text-label3"
        >
          {saved ? 'Save Changes' : 'Finish'}
        </button>
      </div>
    </div>
  )
}

function RestTimer({ left, onDismiss }) {
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  return (
    <div className="sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-10 px-4 pt-1">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Rest, ${left} seconds left. Tap to dismiss.`}
        className="relative flex w-full items-center justify-between overflow-hidden rounded-xl bg-tint-fill px-4 py-2.5 text-white shadow-[0_2px_8px_rgb(0_0_0/0.15)] active:opacity-90"
      >
        <span className="text-[15px] font-semibold">Rest</span>
        <span role="timer" className="text-[28px] font-semibold leading-none tabular-nums">
          {text}
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-1 w-full origin-left bg-white/40 transition-transform duration-300 ease-linear"
          style={{ transform: `scaleX(${left / REST_SECONDS})` }}
        />
      </button>
    </div>
  )
}

function RestDay({ dayKey, workouts, back, scrollRoot, onLogAnyway }) {
  const next = nextWorkout(workouts, dayKey)
  return (
    <div className="flex min-h-dvh flex-col">
      <NavBar title="Rest Day" scrollRoot={scrollRoot} left={back} />
      <header className="px-4 pb-2 pt-1">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-label2">{formatDayKeyLong(dayKey)}</p>
        <h1 className="text-[34px] font-bold leading-[41px] tracking-tight">Rest day</h1>
      </header>
      <div className="mx-4 mt-2 flex items-center gap-3 rounded-[10px] bg-surface px-4 py-3 text-[15px] text-label2">
        <MoonIcon size={22} className="text-label3" />
        <span>No workout scheduled. Gym days are {gymDayNames()}.</span>
      </div>

      <section className="mt-7 px-4" aria-label={`Next workout, ${next}`}>
        <h2 className="px-4 pb-1.5 text-[13px] uppercase tracking-wide text-label2">Next: Workout {next}</h2>
        <ul className="overflow-hidden rounded-[10px] bg-surface">
          {WORKOUTS[next].map((def) => {
            const pf = prefill(workouts, def, dayKey)
            return (
              <li key={def.id} className="grouped-row relative flex min-h-11 items-center gap-2 px-4 py-2.5 text-[17px]">
                <span className="flex-1">{def.name}</span>
                {pf.up && <UpBadge />}
                <span className="text-[15px] tabular-nums text-label2">{describePrefill(pf.sets)}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="mt-6 px-4">
        <button
          type="button"
          onClick={onLogAnyway}
          className="h-[50px] w-full rounded-xl bg-surface text-[17px] font-semibold text-tint transition active:scale-[0.98] active:bg-fill"
        >
          Log Anyway
        </button>
      </div>
    </div>
  )
}

function gymDayNames() {
  // 2026-11-01 was a Sunday, so day n of that week has weekday n.
  const names = GYM_WEEKDAYS.map((d) => new Date(2026, 10, 1 + d).toLocaleDateString(undefined, { weekday: 'long' }))
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
}

function describePrefill(sets) {
  const s = sets[0]
  if ('seconds' in s) return `${sets.length} × ${s.seconds} s`
  return `${sets.length} × ${s.reps}, ${s.weightLb === null ? 'find weight' : s.weightLb === 0 ? 'bodyweight' : `${formatNumber(s.weightLb)} lb`}`
}

function UpBadge() {
  return <span className="rounded-full bg-protein/15 px-2 py-px text-[12px] font-bold uppercase tracking-wide text-protein">Up</span>
}

function exerciseNote(id) {
  const def = exerciseDef(id)
  if (!def) return null
  return def.note ?? { dumbbell: 'Per dumbbell', machine: 'Machine', hold: null }[def.kind]
}

function ExerciseCard({ ex, onField, onDone }) {
  const name = exerciseName(ex.id)
  const note = exerciseNote(ex.id)
  const hold = 'seconds' in ex.sets[0]

  return (
    <section className="mt-6 px-4" aria-label={name}>
      <div className="flex items-center gap-2 pb-1.5 pl-4">
        <h2 className="text-[17px] font-semibold leading-snug">{name}</h2>
        {ex.up && <UpBadge />}
      </div>
      {note && <p className="-mt-1 pb-1.5 pl-4 text-[13px] text-label2">{note}</p>}
      <div className="overflow-hidden rounded-[10px] bg-surface">
        <div aria-hidden="true" className="flex gap-2 px-4 pb-0.5 pt-2 text-[12px] uppercase tracking-wide text-label2">
          <span className="w-7">Set</span>
          <span className="flex-1">{hold ? 'Seconds' : 'lb'}</span>
          {!hold && <span className="w-16">Reps</span>}
          <span className="w-14" />
        </div>
        {ex.sets.map((s, i) => {
          const base = `set-${ex.id}-${i}`
          const label = `${name}, set ${i + 1}`
          return (
            <div key={i} className="grouped-row relative flex items-center gap-2 px-4 py-1.5">
              <span className={`w-7 text-[17px] tabular-nums ${s.done ? 'text-tint' : 'text-label2'}`}>{i + 1}</span>
              {hold ? (
                <NumberField id={`${base}-seconds`} value={s.seconds} onChange={(v) => onField(i, 'seconds', v)} mode="numeric" label={`${label}, seconds`} className="flex-1" />
              ) : (
                <>
                  <NumberField
                    id={`${base}-weight`}
                    value={s.weight}
                    onChange={(v) => onField(i, 'weight', v)}
                    mode="decimal"
                    placeholder="find your weight"
                    label={`${label}, weight in pounds`}
                    className="flex-1"
                  />
                  <NumberField id={`${base}-reps`} value={s.reps} onChange={(v) => onField(i, 'reps', v)} mode="numeric" label={`${label}, reps`} className="w-16" />
                </>
              )}
              <DoneButton done={s.done} disabled={!s.done && Boolean(parseSet(s).error)} label={label} onClick={() => onDone(i, !s.done)} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DoneButton({ done, disabled, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={done}
      aria-label={`${label}, done`}
      className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-lg text-[15px] font-semibold transition active:scale-95 disabled:bg-fill disabled:text-label3 ${
        done ? 'bg-tint-fill text-white' : 'bg-fill text-tint'
      }`}
    >
      {done ? <CheckIcon size={22} strokeWidth={2.6} /> : 'Done'}
    </button>
  )
}

function NumberField({ id, value, onChange, unit, mode, label, placeholder, className = '' }) {
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
        placeholder={placeholder}
        enterKeyHint="done"
        autoComplete="off"
        aria-label={label}
        className="h-full w-full min-w-0 bg-transparent text-right text-[17px] tabular-nums placeholder:text-[15px] placeholder:text-label3 focus:outline-none"
      />
      {unit && (
        <span aria-hidden="true" className="text-[15px] text-label2">
          {unit}
        </span>
      )}
    </label>
  )
}

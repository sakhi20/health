import { useState } from 'react'
import { dayKeyFor, formatDayKey, formatDayKeyLong, formatTime, formatClock } from './day.js'
import { formatGrams, formatMl, formatNumber, parseAmount } from './format.js'
import { goingToBed } from './sleep.js'
import { AnimatedList } from './ui/AnimatedList.jsx'
import { SwipeRow } from './ui/SwipeRow.jsx'
import { Sheet } from './ui/Sheet.jsx'
import { NavBar, LargeTitle, Group, Row, RowButton, HeaderButton, ProgressBar, Segmented } from './ui/layout.jsx'
import {
  PlusIcon,
  SlidersIcon,
  DropIcon,
  MoonIcon,
  XIcon,
  ShareUpIcon,
  TrayDownIcon,
  WarningIcon,
  CheckCircleIcon,
  InfoIcon,
  ListIcon,
  DumbbellIcon,
  ChevronRightIcon,
} from './ui/icons.jsx'
import { SPLITS } from './exercises.js'

export const BOTTLE_ML = 750

const entryKey = (e) => e.id

export function Today({
  now,
  viewing,
  setViewing,
  dayKey,
  day,
  data,
  settings,
  onAddFood,
  onAddWater,
  onDelete,
  onSetField,
  onGoingToBed,
  onOpenSettings,
  workoutStatus,
  workoutDraftOpen,
  onOpenWorkout,
  onExport,
  onImport,
  exportStatus,
  importMessage,
  storageStatus,
  banners,
}) {
  const [openSwipe, setOpenSwipe] = useState(null)
  const [adding, setAdding] = useState(false)

  const entries = day?.entries ?? []
  const food = entries.filter((e) => e.type === 'food')
  const water = entries.filter((e) => e.type === 'water')
  // null when nothing has been logged, distinct from a logged total of 0.
  const proteinTotal = food.length ? food.reduce((sum, e) => sum + e.proteinG, 0) : null
  const bottles = water.length || null
  const sorted = [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
  const title = viewing === 'today' ? 'Today' : 'Yesterday'

  const bed = goingToBed(now)
  const tonight = data.days[bed.dayKey]?.bedtime ?? null

  return (
    <div>
      <NavBar
        title={title}
        right={
          <HeaderButton onClick={onOpenSettings} aria-label="Settings">
            <SlidersIcon size={24} />
          </HeaderButton>
        }
      />
      <LargeTitle eyebrow={formatDayKeyLong(dayKey)}>{title}</LargeTitle>

      <div className="px-4 pt-2">
        <Segmented
          label="Day"
          value={viewing}
          onChange={setViewing}
          options={[
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
          ]}
        />
      </div>

      {banners}

      <Group className="mt-5">
        <Row className="flex-col items-stretch gap-2 py-3.5">
          <Metric
            label="Protein"
            value={proteinTotal === null ? null : formatNumber(proteinTotal)}
            rest={`g of ${formatGrams(settings.proteinTargetG)}`}
            reached={proteinTotal !== null && proteinTotal >= settings.proteinTargetG}
          />
          <ProgressBar
            label="Protein"
            fraction={(proteinTotal ?? 0) / settings.proteinTargetG}
            color="bg-protein"
            valueText={proteinTotal === null ? 'Not logged' : `${formatGrams(proteinTotal)} of ${formatGrams(settings.proteinTargetG)}`}
          />
        </Row>
        <Row className="flex-col items-stretch gap-2 py-3.5">
          <Metric
            label="Water"
            value={bottles === null ? null : String(bottles)}
            rest={`of ${settings.waterTargetBottles} ${settings.waterTargetBottles === 1 ? 'bottle' : 'bottles'}`}
            detail={bottles === null ? null : formatMl(bottles * BOTTLE_ML)}
            reached={bottles !== null && bottles >= settings.waterTargetBottles}
          />
          <ProgressBar
            label="Water"
            fraction={(bottles ?? 0) / settings.waterTargetBottles}
            color="bg-water"
            valueText={
              bottles === null ? 'Not logged' : `${bottles} of ${settings.waterTargetBottles} bottles, ${formatMl(bottles * BOTTLE_ML)}`
            }
          />
        </Row>
      </Group>

      <Group className="mt-4">
        <WorkoutRow status={workoutStatus} draftOpen={workoutDraftOpen} onOpen={onOpenWorkout} />
      </Group>

      <Group header="Log" footer={sorted.length > 0 && 'Swipe left on an entry to delete it.'}>
        {sorted.length === 0 && <EmptyLog viewing={viewing} dayKey={dayKey} />}
        <AnimatedList
          key={dayKey}
          items={sorted}
          getKey={entryKey}
          renderItem={(e) => (
            <SwipeRow
              id={e.id}
              openId={openSwipe}
              setOpenId={setOpenSwipe}
              onDelete={() => {
                setOpenSwipe(null)
                onDelete(e)
              }}
              deleteLabel={`Delete ${describeEntry(e)}`}
            >
              <EntryRow entry={e} dayKey={dayKey} />
            </SwipeRow>
          )}
        />
        <RowButton onClick={() => setAdding(true)} className="text-tint">
          <PlusIcon />
          Add Item
        </RowButton>
      </Group>

      <section className="mt-7 px-4">
        <h2 className="px-4 pb-1.5 text-[13px] uppercase tracking-wide text-label2">Quick Add</h2>
        {settings.quickAdd.length === 0 ? (
          <div className="rounded-[10px] bg-surface px-4 py-3 text-[15px] text-label2">
            No quick add items.{' '}
            <button type="button" onClick={onOpenSettings} className="min-h-11 font-medium text-tint">
              Add some in Settings
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {settings.quickAdd.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onAddFood(q.name, q.proteinG)}
                aria-label={`Add ${q.name}, ${formatGrams(q.proteinG)}`}
                className="flex min-h-[64px] flex-col items-start justify-center rounded-[10px] bg-surface px-3.5 py-2.5 text-left transition-transform duration-150 ease-spring active:scale-[0.97]"
              >
                <span className="text-[17px] leading-snug">{q.name}</span>
                <span className="text-[15px] tabular-nums text-label2">+{formatGrams(q.proteinG)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <Group header="Water">
        <RowButton onClick={onAddWater} aria-label={`Add a ${formatMl(BOTTLE_ML)} bottle`}>
          <DropIcon className="text-tint" />
          <span className="flex-1 text-tint">Add Bottle</span>
          <span className="text-label2 tabular-nums">{formatMl(BOTTLE_ML)}</span>
        </RowButton>
      </Group>

      <Group
        header="Sleep"
        footer={
          viewing === 'today' &&
          (tonight && bed.dayKey !== dayKey
            ? `Going to bed logged at ${formatClock(tonight.value)} for ${formatDayKey(bed.dayKey)}.`
            : 'At night, tap Going to Bed to log tonight’s bedtime for tomorrow.')
        }
      >
        <TimeRow label="Bedtime (last night)" field={day?.bedtime ?? null} onChange={(v) => onSetField('bedtime', v)} />
        <TimeRow label="Wake Time" field={day?.wakeTime ?? null} onChange={(v) => onSetField('wakeTime', v)} />
        {viewing === 'today' && (
          <RowButton onClick={onGoingToBed}>
            <MoonIcon className="text-tint" />
            <span className="text-tint">Going to Bed</span>
          </RowButton>
        )}
      </Group>

      <EnergyGroup value={day?.energy?.value ?? null} onChange={(v) => onSetField('energy', v)} />

      <Group
        header="Data"
        footer={
          <div className="space-y-1.5">
            {importMessage && (
              <p role="status" className={`flex gap-1.5 ${importMessage.ok ? '' : 'text-danger dark:text-[#ff6961]'}`}>
                {importMessage.ok ? <CheckCircleIcon size={16} className="mt-px" /> : <WarningIcon size={16} className="mt-px" />}
                <span className="min-w-0 break-words">{importMessage.text}</span>
              </p>
            )}
            <StorageLine status={storageStatus} />
          </div>
        }
      >
        <RowButton onClick={onExport}>
          <ShareUpIcon className="text-tint" />
          <span className="flex flex-1 flex-col">
            <span className="text-tint">Export Data</span>
            <span className={`flex items-center gap-1 text-[13px] ${exportStatus.overdue ? 'font-medium text-amber' : 'text-label2'}`}>
              {exportStatus.overdue && <WarningIcon size={14} />}
              {exportStatus.label}
            </span>
          </span>
        </RowButton>
        <RowButton onClick={onImport}>
          <TrayDownIcon className="text-tint" />
          <span className="text-tint">Import Data</span>
        </RowButton>
      </Group>

      <div className="h-[max(2.5rem,env(safe-area-inset-bottom))]" />

      <AddItemSheet open={adding} onClose={() => setAdding(false)} dayKey={dayKey} onAdd={onAddFood} />
    </div>
  )
}

function Metric({ label, value, rest, detail, reached }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-label2">{label}</span>
        {reached && (
          <span className="flex items-center gap-1 text-[13px] font-medium text-label2">
            <CheckCircleIcon size={16} />
            Goal reached
          </span>
        )}
      </div>
      <p className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
        {value === null ? (
          <>
            <span className="font-rounded text-[28px] font-semibold leading-8 text-label3">—</span>
            <span className="text-[15px] text-label2">Not logged</span>
          </>
        ) : (
          <>
            <span className="font-rounded text-[28px] font-semibold leading-8">{value}</span>
            <span className="text-[15px] text-label2">{rest}</span>
            {detail && <span className="ml-auto text-[15px] text-label2">{detail}</span>}
          </>
        )}
      </p>
    </div>
  )
}

function WorkoutRow({ status, draftOpen, onOpen }) {
  const value =
    status?.status === 'workout'
      ? (SPLITS[status.split]?.name ?? status.split)
      : status?.status === 'rest'
        ? 'Rest day'
        : draftOpen
          ? 'Not saved yet'
          : 'Not logged'
  return (
    <RowButton onClick={onOpen} aria-label={`Workout: ${value}`}>
      <DumbbellIcon className="text-tint" />
      <span className="flex-1">Workout</span>
      <span className={status ? 'font-medium' : 'text-label2'}>{value}</span>
      <ChevronRightIcon size={18} className="-mr-1 text-label3" />
    </RowButton>
  )
}

function describeEntry(e) {
  return e.type === 'water' ? `water refill, ${formatMl(e.ml)}` : `${e.name}, ${formatGrams(e.proteinG)}`
}

function EntryRow({ entry, dayKey }) {
  // Backfilled entries were logged on a different day than the one they're filed under.
  const loggedDay = dayKeyFor(new Date(entry.loggedAt))
  const time = formatTime(entry.loggedAt)
  const when = loggedDay === dayKey ? time : `Logged ${formatDayKey(loggedDay)}, ${time}`
  const isWater = entry.type === 'water'
  return (
    <Row>
      <div className="min-w-0 flex-1">
        <p className="truncate">{isWater ? 'Water refill' : entry.name}</p>
        <p className="text-[13px] text-label2">{when}</p>
      </div>
      <p className="text-[17px] tabular-nums text-label2">{isWater ? formatMl(entry.ml) : formatGrams(entry.proteinG)}</p>
    </Row>
  )
}

function EmptyLog({ viewing, dayKey }) {
  return (
    <div className="flex flex-col items-center px-6 pb-5 pt-6 text-center">
      <ListIcon size={34} strokeWidth={1.6} className="text-label3" />
      <p className="mt-2 text-[17px] font-semibold">
        {viewing === 'today' ? 'Nothing logged yet' : `Nothing logged for ${formatDayKey(dayKey)}`}
      </p>
      <p className="mt-1 text-[15px] text-label2">
        {viewing === 'today' ? 'Tap a Quick Add item below, or Add Item to enter one.' : 'Backfill it with Add Item or Quick Add.'}
      </p>
    </div>
  )
}

function TimeRow({ label, field, onChange }) {
  const id = label.replace(/\W+/g, '-').toLowerCase()
  return (
    <Row className="py-1.5">
      <label htmlFor={id} className="flex-1">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={field?.value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-11 w-[7.25rem] rounded-lg bg-fill px-2 text-center tabular-nums text-label [&::-webkit-calendar-picker-indicator]:hidden"
      />
      {/* Always takes its space, so the row doesn't shift when a value is set. */}
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label={`Clear ${label.toLowerCase()}`}
        tabIndex={field ? 0 : -1}
        aria-hidden={!field}
        className={`-mr-2 flex h-11 w-11 items-center justify-center text-label3 transition-opacity ${field ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-fill">
          <XIcon size={14} strokeWidth={2.5} />
        </span>
      </button>
    </Row>
  )
}

function EnergyGroup({ value, onChange }) {
  return (
    <Group
      header="Energy"
      headerAction={
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-hidden={value === null}
          tabIndex={value === null ? -1 : 0}
          aria-label="Clear energy rating"
          className={`-mb-2.5 min-h-11 px-1 text-[15px] text-tint transition-opacity ${value === null ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        >
          Clear
        </button>
      }
      footer="1 is lowest, 5 is highest."
    >
      <div role="group" aria-label="Energy rating" className="grid grid-cols-5 gap-1.5 p-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            aria-label={`Energy ${n} of 5`}
            className={`min-h-11 rounded-lg font-rounded text-[19px] tabular-nums transition duration-200 ease-spring active:scale-95 ${
              value === n ? 'bg-tint-fill font-semibold text-white' : 'bg-fill text-label'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </Group>
  )
}

const STORAGE_TEXT = {
  checking: 'Checking storage…',
  persistent: 'Storage is persistent. The browser won’t clear it on its own.',
  'not-persistent': 'Storage is not persistent. The browser may clear it; export regularly.',
  unavailable: 'Persistent storage is unavailable here. Export regularly.',
}

function StorageLine({ status }) {
  const good = status === 'persistent'
  const Icon = status === 'checking' ? InfoIcon : good ? CheckCircleIcon : WarningIcon
  return (
    <p className={`flex gap-1.5 ${good || status === 'checking' ? '' : 'text-amber'}`}>
      <Icon size={16} className="mt-px" />
      <span>{STORAGE_TEXT[status]}</span>
    </p>
  )
}

function AddItemSheet({ open, onClose, dayKey, onAdd }) {
  const [name, setName] = useState('')
  const [protein, setProtein] = useState('')
  const grams = parseAmount(protein)
  const valid = name.trim() !== '' && grams !== null

  const close = () => {
    onClose()
    setName('')
    setProtein('')
  }
  const submit = (e) => {
    e?.preventDefault()
    if (!valid) return
    onAdd(name.trim(), grams)
    close()
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Add Item"
      action={
        <HeaderButton onClick={submit} disabled={!valid} className="font-semibold">
          Add
        </HeaderButton>
      }
    >
      <form onSubmit={submit}>
        <Group className="mt-4">
          <Row className="py-0">
            <label htmlFor="add-name" className="sr-only">
              Item name
            </label>
            <input
              id="add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name"
              autoComplete="off"
              enterKeyHint="next"
              className="h-11 min-w-0 flex-1 bg-transparent placeholder:text-label3 focus:outline-none"
            />
          </Row>
          <Row className="py-0">
            <label htmlFor="add-protein" className="flex-1">
              Protein
            </label>
            <input
              id="add-protein"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              enterKeyHint="done"
              className="h-11 w-20 bg-transparent text-right tabular-nums placeholder:text-label3 focus:outline-none"
            />
            <span className="text-label2">g</span>
          </Row>
        </Group>
        <p className="px-8 pt-1.5 text-[13px] text-label2">Adds to {formatDayKey(dayKey)}.</p>
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

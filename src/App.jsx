import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { dayKeyFor, shiftDayKey, formatDayKey, formatTime } from './day.js'
import {
  loadData,
  saveData,
  exportData,
  emptyDay,
  isDayEmpty,
  newId,
  requestPersistentStorage,
  commitImport,
} from './storage.js'
import { parseImport, previewImport, mergeData } from './importData.js'
import { useLongPress } from './useLongPress.js'

const PROTEIN_TARGET_G = 80
const BOTTLE_ML = 750

const QUICK_ADD = [
  { name: 'Roasted chana', proteinG: 6 },
  { name: 'Peanuts', proteinG: 6 },
  { name: 'Greek yogurt', proteinG: 15 },
  { name: 'Whey scoop', proteinG: 24 },
]

// Re-evaluates "now" periodically and when the app comes back to the foreground,
// so an app left open across 4am rolls over to the new day.
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])
  return now
}

export default function App() {
  const [data, setData] = useState(loadData)
  const [saveFailed, setSaveFailed] = useState(false)
  const [viewing, setViewing] = useState('today')
  const [storageStatus, setStorageStatus] = useState('checking')
  const [pendingImport, setPendingImport] = useState(null) // { incoming, preview }
  const [importMessage, setImportMessage] = useState(null) // { ok, text }
  const fileInput = useRef(null)
  const now = useNow()

  useEffect(() => {
    setSaveFailed(!saveData(data))
  }, [data])

  useEffect(() => {
    requestPersistentStorage().then(setStorageStatus)
  }, [])

  const chooseImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (!file) return
    setImportMessage(null)
    const result = parseImport(await file.text())
    if (!result.ok) {
      setImportMessage({ ok: false, text: `Import rejected: ${result.error} Nothing was changed.` })
      return
    }
    setPendingImport({ incoming: result.data, preview: previewImport(data, result.data) })
  }

  const confirmImport = () => {
    const merged = mergeData(data, pendingImport.incoming)
    const result = commitImport(data, merged)
    setPendingImport(null)
    if (!result.ok) {
      setImportMessage({ ok: false, text: result.error })
      return
    }
    setData(merged)
    setImportMessage({ ok: true, text: `Imported. Previous data backed up as ${result.backupKey}.` })
  }

  const todayKey = dayKeyFor(now)
  const dayKey = viewing === 'today' ? todayKey : shiftDayKey(todayKey, -1)
  const day = data.days[dayKey] ?? null // null = nothing logged for this day

  const updateDay = (fn) =>
    setData((prev) => {
      const current = prev.days[dayKey] ?? emptyDay()
      const next = fn({ ...current, entries: [...current.entries] })
      const days = { ...prev.days }
      if (isDayEmpty(next)) delete days[dayKey]
      else days[dayKey] = next
      return { ...prev, days }
    })

  const addFood = (name, proteinG) =>
    updateDay((d) => ({
      ...d,
      entries: [...d.entries, { id: newId(), type: 'food', name, proteinG, loggedAt: new Date().toISOString() }],
    }))

  const addWater = () =>
    updateDay((d) => ({
      ...d,
      entries: [...d.entries, { id: newId(), type: 'water', ml: BOTTLE_ML, loggedAt: new Date().toISOString() }],
    }))

  const deleteEntry = (id) => updateDay((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }))

  const setField = (field, value) =>
    updateDay((d) => ({ ...d, [field]: value === null ? null : { value, setAt: new Date().toISOString() } }))

  const entries = day?.entries ?? []
  const food = entries.filter((e) => e.type === 'food')
  const water = entries.filter((e) => e.type === 'water')
  // null when nothing has been logged, distinct from a logged total of 0.
  const proteinTotal = food.length ? food.reduce((sum, e) => sum + e.proteinG, 0) : null
  const waterMl = water.length ? water.reduce((sum, e) => sum + e.ml, 0) : null
  const sorted = [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex rounded-lg bg-slate-800 p-1 text-sm">
            {['today', 'yesterday'].map((v) => (
              <button
                key={v}
                onClick={() => setViewing(v)}
                className={`rounded-md px-3 py-1.5 capitalize ${viewing === v ? 'bg-slate-600 font-medium' : 'text-slate-400'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fileInput.current.click()}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 active:bg-slate-700"
            >
              Import
            </button>
            <button onClick={() => exportData(data)} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 active:bg-slate-700">
              Export
            </button>
            <input ref={fileInput} type="file" accept=".json,application/json" onChange={chooseImportFile} className="hidden" />
          </div>
        </header>

        <UpdatePrompt />

        {importMessage && (
          <div
            className={`mb-4 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
              importMessage.ok ? 'bg-emerald-900/60 text-emerald-100' : 'bg-red-900/60 text-red-200'
            }`}
          >
            <p className="break-words">{importMessage.text}</p>
            <button onClick={() => setImportMessage(null)} aria-label="Dismiss" className="shrink-0 px-1">
              ×
            </button>
          </div>
        )}

        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-sm text-slate-400">{formatDayKey(dayKey)}</p>
          <StorageStatus status={storageStatus} />
        </div>

        {saveFailed && (
          <p className="mb-4 rounded-lg bg-red-900/60 px-3 py-2 text-sm text-red-200">
            Couldn't save to this browser's storage. Export your data now.
          </p>
        )}

        <ProteinSummary total={proteinTotal} />

        <Section title="Logged">
          {sorted.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing logged yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl bg-slate-800/60">
                {sorted.map((e) => (
                  <EntryRow key={e.id} entry={e} dayKey={dayKey} onDelete={() => deleteEntry(e.id)} />
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Long press an item to delete it.</p>
            </>
          )}
        </Section>

        <Section title="Quick add">
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ADD.map((q) => (
              <button
                key={q.name}
                onClick={() => addFood(q.name, q.proteinG)}
                className="rounded-xl bg-slate-800 px-3 py-3 text-left active:bg-slate-700"
              >
                <span className="block text-sm">{q.name}</span>
                <span className="text-xs text-emerald-400">+{q.proteinG}g</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Manual entry">
          <ManualEntry onSave={addFood} />
        </Section>

        <Section title="Water">
          <div className="flex items-center justify-between rounded-xl bg-slate-800/60 px-4 py-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {water.length ? `${water.length} bottle${water.length === 1 ? '' : 's'}` : '—'}
              </p>
              <p className="text-sm text-slate-400">{waterMl === null ? 'Not logged' : `${waterMl.toLocaleString()} ml`}</p>
            </div>
            <button
              onClick={addWater}
              aria-label={`Add ${BOTTLE_ML}ml bottle`}
              className="h-14 w-14 rounded-full bg-sky-600 text-3xl leading-none active:bg-sky-500"
            >
              +
            </button>
          </div>
        </Section>

        <Section title="Sleep">
          <div className="grid grid-cols-2 gap-2">
            <TimeField label="Bedtime" field={day?.bedtime ?? null} onChange={(v) => setField('bedtime', v)} />
            <TimeField label="Wake time" field={day?.wakeTime ?? null} onChange={(v) => setField('wakeTime', v)} />
          </div>
        </Section>

        <Section title="Energy">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setField('energy', n)}
                className={`rounded-xl py-3 text-lg tabular-nums ${
                  day?.energy?.value === n ? 'bg-amber-500 font-semibold text-slate-900' : 'bg-slate-800 active:bg-slate-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </Section>
      </div>

      {pendingImport && (
        <ImportPreview preview={pendingImport.preview} onConfirm={confirmImport} onCancel={() => setPendingImport(null)} />
      )}
    </div>
  )
}

const UPDATE_CHECK_MS = 60 * 60 * 1000

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // An installed app can stay open for days, so check for new builds regularly
    // and whenever it comes back to the foreground, not just on launch.
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {})
      }
      setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', check)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-sky-900/70 px-3 py-2 text-sm text-sky-100">
      <p>Update available</p>
      <button onClick={() => updateServiceWorker(true)} className="rounded-md bg-sky-600 px-3 py-1.5 font-medium active:bg-sky-500">
        Reload
      </button>
    </div>
  )
}

const STORAGE_LABELS = {
  checking: ['Storage: checking', 'text-slate-500'],
  persistent: ['Storage: persistent', 'text-emerald-500'],
  'not-persistent': ['Storage: not persistent', 'text-amber-400'],
  unavailable: ['Storage: persist unavailable', 'text-amber-400'],
}

function StorageStatus({ status }) {
  const [label, color] = STORAGE_LABELS[status]
  return <p className={`text-xs ${color}`}>{label}</p>
}

function ImportPreview({ preview, onConfirm, onCancel }) {
  const nothingNew = preview.newEntries === 0 && preview.newDays === 0 && preview.fieldsUpdated === 0
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-slate-800 p-5">
        <h2 className="text-lg font-semibold">Import this file?</h2>
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
          <dt className="text-slate-400">Days in file</dt>
          <dd className="tabular-nums">{preview.days}</dd>
          <dt className="text-slate-400">Entries in file</dt>
          <dd className="tabular-nums">{preview.entries}</dd>
          <dt className="text-slate-400">New days</dt>
          <dd className="tabular-nums">{preview.newDays}</dd>
          <dt className="text-slate-400">New entries</dt>
          <dd className="tabular-nums">{preview.newEntries}</dd>
          <dt className="text-slate-400">Sleep or energy values updated</dt>
          <dd className="tabular-nums">{preview.fieldsUpdated}</dd>
        </dl>
        <p className="mt-4 text-xs text-slate-400">
          {nothingNew
            ? 'Everything in this file is already here. Importing will change nothing.'
            : 'Merges into your current data. Nothing is removed. Your current data is backed up first.'}
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl bg-slate-700 py-3 active:bg-slate-600">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-emerald-600 py-3 font-medium active:bg-emerald-500">
            Import
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  )
}

function ProteinSummary({ total }) {
  const pct = total === null ? 0 : Math.min(100, (total / PROTEIN_TARGET_G) * 100)
  return (
    <div className="rounded-2xl bg-slate-800/60 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-4xl font-semibold tabular-nums">
          {total === null ? '—' : formatGrams(total)}
          <span className="text-lg font-normal text-slate-400"> / {PROTEIN_TARGET_G}g</span>
        </p>
        <p className="text-sm text-slate-400">{total === null ? 'Not logged' : 'protein'}</p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-[width] ${total !== null && total >= PROTEIN_TARGET_G ? 'bg-emerald-400' : 'bg-emerald-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function EntryRow({ entry, dayKey, onDelete }) {
  const [handlers, pressing] = useLongPress(() => {
    const label = entry.type === 'water' ? `${entry.ml}ml water` : `${entry.name} (${formatGrams(entry.proteinG)})`
    if (window.confirm(`Delete ${label}?`)) onDelete()
  })
  // Backfilled entries were logged on a different day than the one they're filed under.
  const loggedDay = dayKeyFor(new Date(entry.loggedAt))
  const time = formatTime(entry.loggedAt)
  const when = loggedDay === dayKey ? time : `logged ${formatDayKey(loggedDay)} ${time}`

  return (
    <li
      {...handlers}
      style={{ WebkitTouchCallout: 'none' }}
      className={`flex select-none items-center justify-between px-4 py-3 transition-colors ${pressing ? 'bg-red-900/40' : ''}`}
    >
      <div>
        <p className="text-sm">{entry.type === 'water' ? 'Water refill' : entry.name}</p>
        <p className="text-xs text-slate-500">{when}</p>
      </div>
      <p className={`text-sm tabular-nums ${entry.type === 'water' ? 'text-sky-400' : 'text-emerald-400'}`}>
        {entry.type === 'water' ? `${entry.ml}ml` : formatGrams(entry.proteinG)}
      </p>
    </li>
  )
}

function ManualEntry({ onSave }) {
  const [name, setName] = useState('')
  const [protein, setProtein] = useState('')
  const grams = Number(protein)
  const valid = name.trim() !== '' && protein.trim() !== '' && Number.isFinite(grams) && grams >= 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSave(name.trim(), grams)
    setName('')
    setProtein('')
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Item"
        className="min-w-0 flex-1 rounded-xl bg-slate-800 px-3 py-3 text-base placeholder:text-slate-500"
      />
      <div className="flex w-24 items-center rounded-xl bg-slate-800 pr-3">
        <input
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="w-full min-w-0 bg-transparent px-3 py-3 text-right text-base tabular-nums placeholder:text-slate-500 focus:outline-none"
        />
        <span className="text-slate-400">g</span>
      </div>
      <button
        type="submit"
        disabled={!valid}
        className="rounded-xl bg-emerald-600 px-4 font-medium active:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500"
      >
        Save
      </button>
    </form>
  )
}

function TimeField({ label, field, onChange }) {
  return (
    <label className="block rounded-xl bg-slate-800/60 px-3 py-2">
      <span className="block text-xs text-slate-400">{label}</span>
      <input
        type="time"
        value={field?.value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full bg-transparent py-1 text-lg tabular-nums [color-scheme:dark]"
      />
    </label>
  )
}

function formatGrams(g) {
  return `${Number.isInteger(g) ? g : g.toFixed(1)}g`
}

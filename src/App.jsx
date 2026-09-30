import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { dayKeyFor, shiftDayKey, formatDayKey, formatClock } from './day.js'
import { loadData, saveData, exportData, applyDayUpdate, newId, requestPersistentStorage, commitImport } from './storage.js'
import { loadSettings, saveSettings } from './settings.js'
import { loadLastExport, saveLastExport, exportReminder } from './exportReminder.js'
import { parseImport, previewImport, mergeData, settingsChanges, previewWorkouts, mergeWorkouts } from './importData.js'
import { loadWorkouts, saveWorkouts, putDay, removeDay, dayStatus, loadDraft } from './workouts.js'
import { goingToBed } from './sleep.js'
import { formatGrams } from './format.js'
import { Today, BOTTLE_ML } from './Today.jsx'
import { SettingsScreen } from './SettingsScreen.jsx'
import { WorkoutScreen } from './WorkoutScreen.jsx'
import { PushedScreen } from './ui/PushedScreen.jsx'
import { Sheet } from './ui/Sheet.jsx'
import { Group, Row, HeaderButton, useLiveAnnouncer } from './ui/layout.jsx'
import { usePresence, SHEET_MS } from './ui/motion.js'
import { WarningIcon } from './ui/icons.jsx'

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
  const [settings, setSettings] = useState(loadSettings)
  const [lastExport, setLastExport] = useState(loadLastExport)
  const [saveFailed, setSaveFailed] = useState(false)
  const [settingsSaveFailed, setSettingsSaveFailed] = useState(false)
  const [viewing, setViewing] = useState('today')
  const [storageStatus, setStorageStatus] = useState('checking')
  const [pendingImport, setPendingImport] = useState(null)
  const [importMessage, setImportMessage] = useState(null) // { ok, text }
  const [showSettings, setShowSettings] = useState(false)
  const [workouts, setWorkouts] = useState(loadWorkouts)
  const [workoutsSaveFailed, setWorkoutsSaveFailed] = useState(false)
  const [workoutDay, setWorkoutDay] = useState(null) // day key the Workout screen is open for
  const [draftDayKey, setDraftDayKey] = useState(() => loadDraft()?.dayKey ?? null)
  const fileInput = useRef(null)
  const opener = useRef(null)
  const settingsScroll = useRef(null)
  const workoutScroll = useRef(null)
  const [liveRegion, announce] = useLiveAnnouncer()
  const now = useNow()

  useEffect(() => {
    setSaveFailed(!saveData(data))
  }, [data])

  useEffect(() => {
    setSettingsSaveFailed(!saveSettings(settings))
  }, [settings])

  useEffect(() => {
    setWorkoutsSaveFailed(!saveWorkouts(workouts))
  }, [workouts])

  useEffect(() => {
    requestPersistentStorage().then(setStorageStatus)
  }, [])

  const todayKey = dayKeyFor(now)
  const dayKey = viewing === 'today' ? todayKey : shiftDayKey(todayKey, -1)
  const day = data.days[dayKey] ?? null // null = nothing logged for this day

  const updateDay = (key, fn) => setData((prev) => applyDayUpdate(prev, key, fn))
  const stamp = () => new Date().toISOString()

  const addFood = (name, proteinG) => {
    updateDay(dayKey, (d) => ({ ...d, entries: [...d.entries, { id: newId(), type: 'food', name, proteinG, loggedAt: stamp() }] }))
    announce(`Added ${name}, ${formatGrams(proteinG)}`)
  }

  const addWater = () => {
    updateDay(dayKey, (d) => ({ ...d, entries: [...d.entries, { id: newId(), type: 'water', ml: BOTTLE_ML, loggedAt: stamp() }] }))
    announce(`Added a ${BOTTLE_ML} ml bottle`)
  }

  const deleteEntry = (entry) => {
    updateDay(dayKey, (d) => ({ ...d, entries: d.entries.filter((e) => e.id !== entry.id) }))
    announce(`Deleted ${entry.type === 'water' ? 'water refill' : entry.name}`)
  }

  const setField = (field, value) => updateDay(dayKey, (d) => ({ ...d, [field]: value === null ? null : { value, setAt: stamp() } }))

  const logGoingToBed = () => {
    const { dayKey: target, value } = goingToBed(new Date())
    updateDay(target, (d) => ({ ...d, bedtime: { value, setAt: stamp() } }))
    announce(`Bedtime ${formatClock(value)} saved for ${formatDayKey(target)}`)
  }

  const doExport = async () => {
    if (await exportData(data, settings, workouts)) {
      const at = stamp()
      saveLastExport(at)
      setLastExport(at)
    }
  }

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
    setPendingImport({
      incoming: result.data,
      settings: result.settings,
      preview: previewImport(data, result.data),
      settingsChanges: settingsChanges(settings, result.settings),
      workouts: result.workouts,
      workoutPreview: previewWorkouts(workouts, result.workouts),
    })
  }

  const confirmImport = () => {
    const { incoming, settings: nextSettings, workouts: incomingWorkouts } = pendingImport
    const merged = mergeData(data, incoming)
    const nextWorkouts = incomingWorkouts === null ? null : mergeWorkouts(workouts, incomingWorkouts)
    const result = commitImport(data, merged, settings, nextSettings, workouts, nextWorkouts)
    setPendingImport(null)
    if (!result.ok) {
      setImportMessage({ ok: false, text: result.error })
      return
    }
    setData(merged)
    if (nextSettings) setSettings(nextSettings)
    if (nextWorkouts) setWorkouts(nextWorkouts)
    setImportMessage({ ok: true, text: `Imported. Your previous data was backed up as ${result.backupKey}.` })
  }

  const closeSettings = useCallback(() => setShowSettings(false), [])
  const closeWorkout = useCallback(() => setWorkoutDay(null), [])
  const settingsPanel = usePresence(showSettings, SHEET_MS)
  const workoutPanel = usePresence(workoutDay !== null, SHEET_MS)
  // Keep the day while the screen animates closed.
  const shownWorkoutDay = useRef(null)
  if (workoutDay) shownWorkoutDay.current = workoutDay
  const covered = (settingsPanel.shown && showSettings) || (workoutPanel.shown && workoutDay !== null)
  const anyMounted = settingsPanel.mounted || workoutPanel.mounted

  // Focus goes back to whatever opened the screen.
  useEffect(() => {
    if (!anyMounted) opener.current?.focus({ preventScroll: true })
  }, [anyMounted])

  const open = (fn) => (e) => {
    opener.current = e?.currentTarget ?? null
    fn()
  }

  const banners = (
    <>
      <UpdatePrompt />
      {(saveFailed || settingsSaveFailed || workoutsSaveFailed) && (
        <div role="alert" className="mx-4 mt-4 flex gap-2 rounded-[10px] bg-surface px-4 py-3 text-[15px] text-danger dark:text-[#ff6961]">
          <WarningIcon size={20} />
          Couldn’t save to this browser’s storage. Export your data now.
        </div>
      )}
    </>
  )

  return (
    <>
      <div inert={covered} className="mx-auto max-w-xl">
        <Today
          now={now}
          viewing={viewing}
          setViewing={setViewing}
          dayKey={dayKey}
          day={day}
          data={data}
          settings={settings}
          onAddFood={addFood}
          onAddWater={addWater}
          onDelete={deleteEntry}
          onSetField={setField}
          onGoingToBed={logGoingToBed}
          onOpenSettings={open(() => setShowSettings(true))}
          workoutStatus={dayStatus(workouts, dayKey)}
          workoutDraftOpen={draftDayKey === dayKey}
          onOpenWorkout={open(() => setWorkoutDay(dayKey))}
          onExport={doExport}
          onImport={() => fileInput.current.click()}
          exportStatus={exportReminder(lastExport, now)}
          importMessage={importMessage}
          storageStatus={storageStatus}
          banners={banners}
        />
      </div>

      <PushedScreen presence={settingsPanel} label="Settings" scrollRef={settingsScroll}>
        <SettingsScreen settings={settings} onChange={setSettings} onBack={closeSettings} scrollRoot={settingsScroll} announce={announce} />
      </PushedScreen>

      <PushedScreen presence={workoutPanel} label="Workout" scrollRef={workoutScroll}>
        {shownWorkoutDay.current && (
          <WorkoutScreen
            key={shownWorkoutDay.current}
            dayKey={shownWorkoutDay.current}
            workouts={workouts}
            onSave={(key, value) => setWorkouts((w) => putDay(w, key, value))}
            onRemove={(key) => setWorkouts((w) => removeDay(w, key))}
            onBack={closeWorkout}
            onDraftChange={setDraftDayKey}
            scrollRoot={workoutScroll}
            announce={announce}
          />
        )}
      </PushedScreen>

      <ImportPreviewSheet pending={pendingImport} onCancel={() => setPendingImport(null)} onConfirm={confirmImport} />
      <input ref={fileInput} type="file" accept=".json,application/json" onChange={chooseImportFile} className="hidden" />
      {liveRegion}
    </>
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
    <div role="status" className="row-enter mx-4 mt-4 flex items-center justify-between gap-3 rounded-[10px] bg-surface py-1 pl-4 pr-2">
      <p className="text-[15px]">Update available</p>
      <HeaderButton onClick={() => updateServiceWorker(true)} className="font-semibold">
        Reload
      </HeaderButton>
    </div>
  )
}

function ImportPreviewSheet({ pending, onCancel, onConfirm }) {
  // Keep the last content on screen while the sheet animates closed.
  const last = useRef(pending)
  if (pending) last.current = pending
  const p = last.current
  const changes = p?.settingsChanges ?? null
  const wp = p?.workoutPreview ?? null
  const nothingNew =
    p &&
    p.preview.newEntries === 0 &&
    p.preview.newDays === 0 &&
    p.preview.fieldsUpdated === 0 &&
    (changes === null || changes.length === 0) &&
    (wp === null || wp.newDays + wp.updatedDays === 0)

  return (
    <Sheet
      open={pending !== null}
      onClose={onCancel}
      title="Import Data"
      action={
        <HeaderButton onClick={onConfirm} className="font-semibold">
          Import
        </HeaderButton>
      }
    >
      {p && (
        <>
          <Group header="In this file" className="mt-2">
            <Stat label="Days" value={p.preview.days} />
            <Stat label="Entries" value={p.preview.entries} />
          </Group>
          <Group header="What will change" footer="Entries are merged and nothing is removed. Your current data is backed up first.">
            <Stat label="New days" value={p.preview.newDays} />
            <Stat label="New entries" value={p.preview.newEntries} />
            <Stat label="Sleep or energy values updated" value={p.preview.fieldsUpdated} />
          </Group>
          <Group
            header="Workouts"
            footer={
              wp === null
                ? 'This file has no workouts. Your current workouts are kept.'
                : 'Workout days are merged. Where both have the same day, the more recently saved one is kept.'
            }
          >
            {wp === null ? (
              <Row className="text-label2">Not included</Row>
            ) : (
              <>
                <Stat label="Workout and rest days in file" value={wp.days} />
                <Stat label="New days" value={wp.newDays} />
                <Stat label="Days replaced by a newer save" value={wp.updatedDays} />
              </>
            )}
          </Group>
          <Group
            header="Settings"
            footer={changes === null ? 'This file has no settings. Your current settings are kept.' : 'Settings are replaced by the ones in the file.'}
          >
            {changes === null ? (
              <Row className="text-label2">Not included</Row>
            ) : changes.length === 0 ? (
              <Row className="text-label2">No changes</Row>
            ) : (
              changes.map((c) => (
                <Row key={c} className="text-[15px]">
                  {c}
                </Row>
              ))
            )}
          </Group>
          {nothingNew && <p className="px-8 pt-4 text-center text-[15px] text-label2">Everything in this file is already here. Importing changes nothing.</p>}
        </>
      )}
    </Sheet>
  )
}

function Stat({ label, value }) {
  return (
    <Row>
      <span className="flex-1">{label}</span>
      <span className="tabular-nums text-label2">{value}</span>
    </Row>
  )
}

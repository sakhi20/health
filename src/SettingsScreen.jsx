import { useEffect, useRef, useState } from 'react'
import { formatGrams, formatMl, formatNumber, parseAmount } from './format.js'
import {
  setProteinTarget,
  setWaterTarget,
  addQuickItem,
  updateQuickItem,
  removeQuickItem,
  moveQuickItem,
  isValidProteinTarget,
  PROTEIN_TARGET_MAX,
  WATER_TARGET_MAX,
} from './settings.js'
import { BOTTLE_ML } from './Today.jsx'
import { AnimatedList } from './ui/AnimatedList.jsx'
import { SwipeRow } from './ui/SwipeRow.jsx'
import { Sheet } from './ui/Sheet.jsx'
import { NavBar, LargeTitle, Group, Row, RowButton, HeaderButton } from './ui/layout.jsx'
import { ChevronLeftIcon, ChevronRightIcon, GripIcon, PlusIcon, MinusIcon } from './ui/icons.jsx'

const quickKey = (q) => q.id

export function SettingsScreen({ settings, onChange, onBack, scrollRoot, announce }) {
  const [editing, setEditing] = useState(false)
  const [openSwipe, setOpenSwipe] = useState(null)
  const [sheet, setSheet] = useState(null) // null | { mode: 'new' } | { mode: 'edit', item }
  const [dragging, setDragging] = useState(null)

  const move = (from, to) => {
    onChange((s) => moveQuickItem(s, from, to))
    const item = settings.quickAdd[from]
    if (item) announce(`${item.name} moved to position ${to + 1} of ${settings.quickAdd.length}`)
  }

  return (
    <div>
      <NavBar
        title="Settings"
        scrollRoot={scrollRoot}
        left={
          <HeaderButton onClick={onBack} className="-ml-1">
            <ChevronLeftIcon size={26} strokeWidth={2.2} />
            Today
          </HeaderButton>
        }
      />
      <LargeTitle>Settings</LargeTitle>

      <Group header="Daily Targets" footer={`Each bottle is ${formatMl(BOTTLE_ML)}. ${settings.waterTargetBottles} bottles is ${formatMl(settings.waterTargetBottles * BOTTLE_ML)}.`}>
        <ProteinTargetRow value={settings.proteinTargetG} onCommit={(v) => onChange((s) => setProteinTarget(s, v))} />
        <Row className="py-0">
          <span className="flex-1">Water</span>
          <Stepper
            value={settings.waterTargetBottles}
            min={1}
            max={WATER_TARGET_MAX}
            unit={(n) => (n === 1 ? 'bottle' : 'bottles')}
            onChange={(v) => onChange((s) => setWaterTarget(s, v))}
          />
        </Row>
      </Group>

      <Group
        header="Quick Add"
        headerAction={
          settings.quickAdd.length > 1 && (
            <HeaderButton onClick={() => setEditing((e) => !e)} className="-mb-2.5 -mr-2 text-[15px]">
              {editing ? 'Done' : 'Reorder'}
            </HeaderButton>
          )
        }
        footer={editing ? 'Drag the handles to change the order on Today.' : 'Tap an item to edit it. Swipe left to delete.'}
      >
        {settings.quickAdd.length === 0 && <Row className="text-label2">No quick add items.</Row>}
        <AnimatedList
          items={settings.quickAdd}
          getKey={quickKey}
          pinnedKey={dragging}
          renderItem={(q) => {
            const index = settings.quickAdd.findIndex((x) => x.id === q.id)
            return (
              <SwipeRow
                id={q.id}
                openId={openSwipe}
                setOpenId={setOpenSwipe}
                onTap={editing ? undefined : () => setSheet({ mode: 'edit', item: q })}
                onDelete={() => {
                  setOpenSwipe(null)
                  onChange((s) => removeQuickItem(s, q.id))
                  announce(`Deleted ${q.name}`)
                }}
                deleteLabel={`Delete ${q.name}`}
              >
                <QuickRow
                  item={q}
                  index={index}
                  count={settings.quickAdd.length}
                  editing={editing}
                  onEdit={() => setSheet({ mode: 'edit', item: q })}
                  onMove={move}
                  onDragChange={(d) => setDragging(d ? q.id : null)}
                />
              </SwipeRow>
            )
          }}
        />
        <RowButton onClick={() => setSheet({ mode: 'new' })} className="text-tint">
          <PlusIcon />
          Add Quick Item
        </RowButton>
      </Group>

      <div className="h-[max(2.5rem,env(safe-area-inset-bottom))]" />

      <QuickItemSheet
        sheet={sheet}
        onClose={() => setSheet(null)}
        onSave={(fields) => {
          if (sheet?.mode === 'edit') onChange((s) => updateQuickItem(s, sheet.item.id, fields))
          else onChange((s) => addQuickItem(s, fields))
          setSheet(null)
        }}
        onDelete={() => {
          onChange((s) => removeQuickItem(s, sheet.item.id))
          announce(`Deleted ${sheet.item.name}`)
          setSheet(null)
        }}
      />
    </div>
  )
}

function ProteinTargetRow({ value, onCommit }) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const parsed = parseAmount(text)
  const invalid = focused && text.trim() !== '' && !isValidProteinTarget(parsed)

  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  const commit = () => {
    setFocused(false)
    if (isValidProteinTarget(parsed)) onCommit(parsed)
    else setText(String(value))
  }

  return (
    <Row className="flex-wrap py-0">
      <label htmlFor="protein-target" className="flex-1">
        Protein
      </label>
      <input
        id="protein-target"
        value={text}
        inputMode="decimal"
        enterKeyHint="done"
        aria-invalid={invalid || undefined}
        aria-describedby="protein-target-hint"
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-11 w-20 bg-transparent text-right tabular-nums text-label2 focus:text-label focus:outline-none"
      />
      <span className="text-label2">g</span>
      {/* Reserved line, so the row height doesn't jump while typing. */}
      <p id="protein-target-hint" aria-live="polite" className={`basis-full pb-1 text-[13px] ${invalid ? 'text-danger dark:text-[#ff6961]' : 'sr-only'}`}>
        {invalid ? `Enter a number from 1 to ${PROTEIN_TARGET_MAX}.` : ''}
      </p>
    </Row>
  )
}

function Stepper({ value, min, max, unit, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <span aria-live="polite" className="mr-2 tabular-nums text-label2">
        {value} {unit(value)}
      </span>
      <div className="flex h-9 items-center rounded-lg bg-fill">
        <button
          type="button"
          aria-label="Fewer bottles"
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex h-11 w-12 items-center justify-center text-label disabled:text-label3"
        >
          <MinusIcon size={18} />
        </button>
        <span className="h-5 w-px bg-sep" aria-hidden="true" />
        <button
          type="button"
          aria-label="More bottles"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex h-11 w-12 items-center justify-center text-label disabled:text-label3"
        >
          <PlusIcon size={18} />
        </button>
      </div>
    </div>
  )
}

function QuickRow({ item, index, count, editing, onEdit, onMove, onDragChange }) {
  const drag = useRef(null)

  const onHandleDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const li = e.currentTarget.closest('li')
    drag.current = { startY: e.clientY, index, height: li.offsetHeight, el: li.firstElementChild }
    Object.assign(drag.current.el.style, { transition: 'none', zIndex: '2', boxShadow: '0 6px 20px rgb(0 0 0 / 0.18)' })
    onDragChange(true)
  }
  const onHandleMove = (e) => {
    const d = drag.current
    if (!d) return
    e.stopPropagation()
    let dy = e.clientY - d.startY
    if (dy > d.height / 2 && d.index < count - 1) {
      onMove(d.index, d.index + 1)
      d.index += 1
      d.startY += d.height
    } else if (dy < -d.height / 2 && d.index > 0) {
      onMove(d.index, d.index - 1)
      d.index -= 1
      d.startY -= d.height
    }
    dy = e.clientY - d.startY
    d.el.style.transform = `translateY(${dy}px) scale(1.02)`
  }
  const onHandleUp = (e) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    e.stopPropagation()
    Object.assign(d.el.style, { transition: 'transform 220ms var(--ease-spring), box-shadow 220ms', transform: '', boxShadow: '' })
    setTimeout(() => (d.el.style.zIndex = ''), 220)
    onDragChange(false)
  }

  return (
    <Row>
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <span className="tabular-nums text-label2">{formatGrams(item.proteinG)}</span>
      {editing ? (
        <>
          <span
            role="presentation"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className="-my-2.5 -mr-4 flex h-11 w-12 cursor-grab touch-none items-center justify-center text-label3"
          >
            <GripIcon />
          </span>
          {/* Screen reader and keyboard alternative to dragging. */}
          <button type="button" className="sr-only focus:not-sr-only" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            Move {item.name} up
          </button>
          <button type="button" className="sr-only focus:not-sr-only" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
            Move {item.name} down
          </button>
        </>
      ) : (
        <button type="button" onClick={onEdit} aria-label={`Edit ${item.name}`} className="-my-2.5 -mr-4 flex h-11 w-11 items-center justify-center text-label3">
          <ChevronRightIcon size={18} />
        </button>
      )}
    </Row>
  )
}

function QuickItemSheet({ sheet, onClose, onSave, onDelete }) {
  const [name, setName] = useState('')
  const [protein, setProtein] = useState('')
  const open = sheet !== null
  // Keep showing the last sheet's title while it animates closed.
  const last = useRef(sheet)
  if (sheet) last.current = sheet
  const isEdit = last.current?.mode === 'edit'

  useEffect(() => {
    if (!sheet) return
    const edit = sheet.mode === 'edit'
    setName(edit ? sheet.item.name : '')
    setProtein(edit ? String(sheet.item.proteinG) : '')
  }, [sheet])

  const grams = parseAmount(protein)
  const valid = name.trim() !== '' && grams !== null
  const submit = (e) => {
    e?.preventDefault()
    if (valid) onSave({ name: name.trim(), proteinG: grams })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Item' : 'New Item'}
      action={
        <HeaderButton onClick={submit} disabled={!valid} className="font-semibold">
          Save
        </HeaderButton>
      }
    >
      <form onSubmit={submit}>
        <Group className="mt-4">
          <Row className="py-0">
            <label htmlFor="quick-name" className="sr-only">
              Name
            </label>
            <input
              id="quick-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              autoComplete="off"
              enterKeyHint="next"
              className="h-11 min-w-0 flex-1 bg-transparent placeholder:text-label3 focus:outline-none"
            />
          </Row>
          <Row className="py-0">
            <label htmlFor="quick-protein" className="flex-1">
              Protein
            </label>
            <input
              id="quick-protein"
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
        {isEdit && (
          <Group>
            <RowButton onClick={onDelete} className="justify-center text-danger dark:text-[#ff6961]">
              Delete Item
            </RowButton>
          </Group>
        )}
        <p className="px-8 pt-3 text-[13px] text-label2">
          {valid ? `Adds ${formatNumber(grams)} g of protein with one tap on Today.` : 'Enter a name and grams of protein.'}
        </p>
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

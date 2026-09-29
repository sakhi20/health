import { useEffect, useRef, useState } from 'react'

const ACTION_W = 88
const LOCK_PX = 8

// Swipe left to reveal Delete. Only one row is open at a time (openId/setOpenId).
// The Delete button is always in the DOM, so VoiceOver and keyboard users can reach it
// without swiping.
export function SwipeRow({ id, openId, setOpenId, onDelete, deleteLabel, onTap, children }) {
  const content = useRef(null)
  const gesture = useRef(null)
  const [dragging, setDragging] = useState(false)
  const isOpen = openId === id

  const settle = (x) => {
    const el = content.current
    if (!el) return
    el.style.transition = ''
    el.style.transform = x ? `translateX(${x}px)` : ''
  }

  useEffect(() => {
    settle(isOpen ? -ACTION_W : 0)
  }, [isOpen])

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gesture.current = { x: e.clientX, y: e.clientY, base: isOpen ? -ACTION_W : 0, dir: null, dx: 0, id: e.pointerId }
  }

  const onPointerMove = (e) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.dir) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return
      g.dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (g.dir === 'y') return
      e.currentTarget.setPointerCapture(e.pointerId)
      content.current.style.transition = 'none'
      setDragging(true)
      if (openId !== id) setOpenId(null)
    }
    if (g.dir !== 'x') return
    g.dx = dx
    let x = g.base + dx
    if (x > 0) x = x * 0.2 // rubber band past closed
    if (x < -ACTION_W) x = -ACTION_W + (x + ACTION_W) * 0.3 // and past open
    content.current.style.transform = `translateX(${x}px)`
  }

  const onPointerUp = (e) => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.id !== e.pointerId) return
    setDragging(false)
    if (g.dir === 'x') {
      const x = g.base + g.dx
      const open = x < -ACTION_W / 2
      setOpenId(open ? id : null)
      settle(open ? -ACTION_W : 0)
      return
    }
    if (g.dir === null && e.type === 'pointerup') {
      // A tap: close this row if it's open, otherwise pass the tap on.
      if (isOpen) setOpenId(null)
      else if (openId) setOpenId(null)
      else onTap?.()
    }
  }

  const onPointerCancel = (e) => {
    if (gesture.current?.dir === 'x') settle(isOpen ? -ACTION_W : 0)
    gesture.current = null
    setDragging(false)
    void e
  }

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onClick={onDelete}
        onFocus={() => setOpenId(id)}
        aria-label={deleteLabel}
        className={`absolute inset-y-0 right-0 flex items-center justify-end bg-danger pr-5 text-[17px] font-medium text-white ${
          // Hide only after the row has slid shut.
          isOpen || dragging ? 'opacity-100' : 'opacity-0 [transition:opacity_0s_260ms]'
        }`}
        style={{ width: ACTION_W + 40 }}
      >
        Delete
      </button>
      <div
        ref={content}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="relative bg-surface transition-transform duration-[260ms] ease-spring [touch-action:pan-y]"
      >
        {children}
      </div>
    </div>
  )
}

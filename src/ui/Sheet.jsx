import { useEffect, useId, useRef, useState } from 'react'
import { usePresence, SHEET_MS } from './motion.js'
import { HeaderButton } from './layout.jsx'

const DISMISS_PX = 90

// Bottom sheet with an iOS-style header: Cancel on the left, the action on the right.
export function Sheet({ open, onClose, title, action, children }) {
  const { mounted, shown } = usePresence(open, SHEET_MS)
  const titleId = useId()
  const panel = useRef(null)
  const opener = useRef(null)
  const drag = useRef(null)
  const keyboard = useKeyboardInset(mounted)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener.current?.focus?.({ preventScroll: true })
    }
  }, [open])

  // Move focus into the sheet once it exists, so VoiceOver starts there.
  useEffect(() => {
    if (open && mounted) panel.current?.focus({ preventScroll: true })
  }, [open, mounted])

  if (!mounted) return null

  // Drag the header down to dismiss. Transform is written directly, no re-render per frame.
  const onPointerDown = (e) => {
    if (e.target.closest('button')) return
    drag.current = { y: e.clientY, dy: 0, t: e.timeStamp }
    e.currentTarget.setPointerCapture(e.pointerId)
    panel.current.style.transition = 'none'
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.y
    drag.current.dy = dy
    // Resist upward drags, follow downward ones.
    panel.current.style.transform = `translateY(${dy > 0 ? dy : dy * 0.2}px)`
  }
  const onPointerUp = (e) => {
    if (!drag.current) return
    const { dy, t } = drag.current
    drag.current = null
    panel.current.style.transition = ''
    panel.current.style.transform = ''
    const fast = dy > 30 && dy / Math.max(1, e.timeStamp - t) > 0.6
    if (dy > DISMISS_PX || fast) onClose()
  }

  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-overlay transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ bottom: keyboard }}
        className={`elevated absolute inset-x-0 mx-auto flex max-h-[92dvh] max-w-xl flex-col rounded-t-[14px] bg-canvas shadow-[0_-8px_40px_rgb(0_0_0/0.18)] outline-none transition-transform duration-[320ms] ease-spring ${
          shown ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="touch-none select-none"
        >
          <div className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-label3/50" aria-hidden="true" />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-2 pb-1">
            <div className="flex justify-start">
              <HeaderButton onClick={onClose}>Cancel</HeaderButton>
            </div>
            <h2 id={titleId} className="text-[17px] font-semibold">
              {title}
            </h2>
            <div className="flex justify-end">{action}</div>
          </div>
        </div>
        <div className="overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}

// Height of the on-screen keyboard, so the sheet can sit above it.
function useKeyboardInset(active) {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])
  return inset
}

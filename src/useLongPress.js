import { useRef, useState } from 'react'

const MOVE_TOLERANCE_PX = 10

export function useLongPress(onLongPress, ms = 550) {
  const timer = useRef(null)
  const origin = useRef(null)
  const [pressing, setPressing] = useState(false)

  const cancel = () => {
    clearTimeout(timer.current)
    timer.current = null
    origin.current = null
    setPressing(false)
  }

  const handlers = {
    onPointerDown: (e) => {
      cancel()
      origin.current = { x: e.clientX, y: e.clientY }
      setPressing(true)
      timer.current = setTimeout(() => {
        cancel()
        navigator.vibrate?.(30)
        onLongPress()
      }, ms)
    },
    // Scrolling the list shouldn't count as a press.
    onPointerMove: (e) => {
      if (!origin.current) return
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > MOVE_TOLERANCE_PX) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
  }

  return [handlers, pressing]
}

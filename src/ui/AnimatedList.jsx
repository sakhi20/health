import { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { DURATION_MS, prefersReducedMotion } from './motion.js'

// Renders a keyed list and animates it with transform and opacity only:
// new items fade in, removed items slide out, and the rest glide to their
// new positions (FLIP: measure, invert with a transform, then release).
// pinnedKey: an item being dragged, which follows the finger instead.
export function AnimatedList({ items, getKey, renderItem, className = '', pinnedKey = null }) {
  const [, rerender] = useReducer((n) => n + 1, 0)
  const state = useRef({ items, leaving: [], rendered: items, fresh: new Set() })
  const nodes = useRef(new Map())
  const lastTops = useRef(new Map())
  const mounted = useRef(false)

  // Work out what left and what arrived. Idempotent, so safe under StrictMode double render.
  const s = state.current
  if (s.items !== items) {
    const keys = new Set(items.map(getKey))
    const prevKeys = new Set(s.items.map(getKey))
    const leaving = s.leaving.filter((l) => !keys.has(l.key))
    if (!prefersReducedMotion()) {
      s.rendered.forEach((item, index) => {
        const key = getKey(item)
        if (!keys.has(key) && !leaving.some((l) => l.key === key)) leaving.push({ key, item, index })
      })
    }
    const rendered = [...items]
    for (const l of [...leaving].sort((a, b) => a.index - b.index)) rendered.splice(Math.min(l.index, rendered.length), 0, l.item)
    state.current = {
      items,
      leaving,
      rendered,
      fresh: mounted.current ? new Set(items.map(getKey).filter((k) => !prevKeys.has(k))) : new Set(),
    }
  }
  const { rendered, leaving, fresh } = state.current
  const leavingKeys = new Set(leaving.map((l) => l.key))

  // Drop leaving items once their exit animation has played.
  useEffect(() => {
    if (!leaving.length) return
    const t = setTimeout(() => {
      const gone = new Set(leaving.map((l) => l.key))
      const current = state.current
      const stillThere = new Set(current.items.map(getKey))
      state.current = {
        ...current,
        leaving: current.leaving.filter((l) => !gone.has(l.key)),
        rendered: current.rendered.filter((item) => !gone.has(getKey(item)) || stillThere.has(getKey(item))),
      }
      rerender()
    }, DURATION_MS)
    return () => clearTimeout(t)
  }, [leaving, getKey])

  useEffect(() => {
    mounted.current = true
  }, [])

  // FLIP: anything that moved since the last layout gets transformed back, then released.
  useLayoutEffect(() => {
    const tops = new Map()
    for (const [key, el] of nodes.current) tops.set(key, el.offsetTop)
    if (!prefersReducedMotion()) {
      for (const [key, top] of tops) {
        const before = lastTops.current.get(key)
        const el = nodes.current.get(key)
        if (before === undefined || before === top || leavingKeys.has(key) || key === pinnedKey) continue
        el.style.transition = 'none'
        el.style.transform = `translateY(${before - top}px)`
        void el.offsetHeight
        el.style.transition = `transform ${DURATION_MS}ms var(--ease-spring)`
        el.style.transform = ''
      }
    }
    lastTops.current = tops
  })

  return (
    <ul className={`grouped-list ${className}`}>
      {rendered.map((item) => {
        const key = getKey(item)
        const isLeaving = leavingKeys.has(key)
        return (
          <li
            key={key}
            ref={(el) => {
              if (el) nodes.current.set(key, el)
              else nodes.current.delete(key)
            }}
            aria-hidden={isLeaving || undefined}
            className={`grouped-row relative ${fresh.has(key) ? 'row-enter' : ''} ${
              isLeaving ? 'pointer-events-none -translate-x-full opacity-0 transition duration-[260ms] ease-spring' : ''
            }`}
          >
            {renderItem(item)}
          </li>
        )
      })}
    </ul>
  )
}

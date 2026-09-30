import { useEffect, useState } from 'react'

export const DURATION_MS = 260
export const SHEET_MS = 320

const query = '(prefers-reduced-motion: reduce)'

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.(query).matches

// Keeps something mounted while it animates out.
// Returns { mounted, shown }: render when mounted, apply the "in" styles when shown.
export function usePresence(open, ms) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      // Two frames so the "out" styles are painted before transitioning in.
      let raf2
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : ms)
    return () => clearTimeout(t)
  }, [open, ms])
  return { mounted, shown }
}

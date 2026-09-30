import { useEffect, useRef, useState } from 'react'

// iOS-style navigation bar: stays pinned, shows the small title and a hairline
// once the large title has scrolled under it.
export function NavBar({ title, left, right, scrollRoot }) {
  return (
    <div className="sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
      <div className="nav-bg absolute inset-0 border-b border-transparent bg-bar opacity-0 backdrop-blur-xl transition-opacity duration-200 [.scrolled_&]:border-sep [.scrolled_&]:opacity-100" />
      <div className="relative mx-auto grid h-11 max-w-xl grid-cols-[1fr_auto_1fr] items-center px-2">
        <div className="flex justify-start">{left}</div>
        <p
          aria-hidden="true"
          className="translate-y-1 text-[17px] font-semibold opacity-0 transition duration-200 [.scrolled_&]:translate-y-0 [.scrolled_&]:opacity-100"
        >
          {title}
        </p>
        <div className="flex justify-end">{right}</div>
      </div>
      <ScrollWatcher scrollRoot={scrollRoot} />
    </div>
  )
}

// Adds "scrolled" to the nav bar's parent once the page has scrolled past the large title.
function ScrollWatcher({ scrollRoot }) {
  const ref = useRef(null)
  useEffect(() => {
    const bar = ref.current?.parentElement
    const screen = bar?.parentElement
    if (!bar || !screen) return
    const target = scrollRoot?.current ?? window
    const read = () => (target === window ? window.scrollY : target.scrollTop)
    const onScroll = () => screen.classList.toggle('scrolled', read() > 44)
    onScroll()
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => target.removeEventListener('scroll', onScroll)
  }, [scrollRoot])
  return <span ref={ref} hidden />
}

export function LargeTitle({ eyebrow, children }) {
  return (
    <header className="px-4 pb-2 pt-1">
      {eyebrow && <p className="text-[13px] font-semibold uppercase tracking-wide text-label2">{eyebrow}</p>}
      <h1 className="text-[34px] font-bold leading-[41px] tracking-tight">{children}</h1>
    </header>
  )
}

// className sets the top margin (default mt-7).
export function Group({ header, headerAction, footer, children, className = 'mt-7' }) {
  return (
    <section className={`px-4 ${className}`}>
      {(header || headerAction) && (
        <div className="flex min-h-[28px] items-end justify-between px-4 pb-1.5">
          {header && <h2 className="text-[13px] uppercase tracking-wide text-label2">{header}</h2>}
          {headerAction}
        </div>
      )}
      <div className="overflow-hidden rounded-[10px] bg-surface">{children}</div>
      {footer && <div className="px-4 pt-1.5 text-[13px] leading-[18px] text-label2">{footer}</div>}
    </section>
  )
}

// A row in a grouped list. Rows after the first get an inset hairline on top.
export function Row({ children, className = '', as: As = 'div', ...rest }) {
  return (
    <As
      className={`grouped-row relative flex min-h-11 items-center gap-3 px-4 py-2.5 text-[17px] ${className}`}
      {...rest}
    >
      {children}
    </As>
  )
}

export function RowButton({ children, className = '', ...rest }) {
  return (
    <Row as="button" type="button" className={`w-full text-left transition-colors active:bg-fill ${className}`} {...rest}>
      {children}
    </Row>
  )
}

export function HeaderButton({ children, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`flex min-h-11 min-w-11 items-center justify-center gap-0.5 rounded-lg px-2 text-[17px] text-tint transition-opacity active:opacity-40 disabled:text-label3 disabled:active:opacity-100 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// Fill is a full-width bar slid left, so only transform animates.
export function ProgressBar({ fraction, color, label, valueText }) {
  const f = Math.max(0, Math.min(1, fraction))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(f * 100)}
      aria-valuetext={valueText}
      className="h-2.5 overflow-hidden rounded-full bg-track"
    >
      <div
        className={`h-full w-full rounded-full transition-transform duration-500 ease-spring ${color}`}
        style={{ transform: `translateX(${(f - 1) * 100}%)` }}
      />
    </div>
  )
}

export function useLiveAnnouncer() {
  const [message, setMessage] = useState('')
  const region = (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  )
  // Clearing first makes screen readers repeat identical messages.
  const announce = (text) => {
    setMessage('')
    requestAnimationFrame(() => setMessage(text))
  }
  return [region, announce]
}

// iOS segmented control. The thumb slides with transform; value can be null (nothing picked).
export function Segmented({ label, value, onChange, options }) {
  const n = options.length
  const index = options.findIndex(([v]) => v === value)
  return (
    <div
      role="group"
      aria-label={label}
      className="relative grid h-12 rounded-[10px] bg-fill p-0.5"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-y-0.5 left-0.5 rounded-[8px] bg-thumb shadow-[0_1px_3px_rgb(0_0_0/0.12)] transition duration-[260ms] ease-spring ${
          index < 0 ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ width: `calc((100% - 4px) / ${n})`, transform: `translateX(${Math.max(index, 0) * 100}%)` }}
      />
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
          className={`relative text-[15px] transition-colors ${v === value ? 'font-semibold' : 'text-label2'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

// A full screen that slides in from the right over Today, like iOS navigation.
// presence comes from usePresence, so the caller also knows when it's covering Today.
export function PushedScreen({ presence, label, scrollRef, children }) {
  if (!presence.mounted) return null
  return (
    <div
      ref={scrollRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      // No transform at all once shown: any transform would trap the sheets'
      // position: fixed inside this scrolling panel.
      style={{ transform: presence.shown ? 'none' : 'translateX(100%)' }}
      className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-canvas transition-transform duration-[320ms] ease-spring"
    >
      <div className="mx-auto max-w-xl">{children}</div>
    </div>
  )
}

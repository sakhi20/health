// Simple stroke icons drawn for this app. Decorative: always aria-hidden,
// the surrounding control carries the accessible label.
function Icon({ children, size = 22, className = '', strokeWidth = 2 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  )
}

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const MinusIcon = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
)

export const XIcon = (p) => (
  <Icon {...p}>
    <path d="M7 7l10 10M17 7L7 17" />
  </Icon>
)

export const ChevronLeftIcon = (p) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)

export const ChevronRightIcon = (p) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
)

export const SlidersIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
)

export const DropIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.5c3 3.6 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.9 6-10.5z" />
  </Icon>
)

export const ShareUpIcon = (p) => (
  <Icon {...p}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M6 12H5v8h14v-8h-1" />
  </Icon>
)

export const TrayDownIcon = (p) => (
  <Icon {...p}>
    <path d="M12 4v11M8 11l4 4 4-4" />
    <path d="M6 12H5v8h14v-8h-1" />
  </Icon>
)

export const WarningIcon = (p) => (
  <Icon {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Icon>
)

export const CheckCircleIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.5 2.5L16 9.5" />
  </Icon>
)

export const InfoIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </Icon>
)

export const GripIcon = (p) => (
  <Icon {...p}>
    <path d="M5 8h14M5 12h14M5 16h14" />
  </Icon>
)

export const ListIcon = (p) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Icon>
)

export const MoonIcon = (p) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
)

export const DumbbellIcon = (p) => (
  <Icon {...p}>
    <path d="M8 12h8" />
    <path d="M5 8.5v7M8 7v10M16 7v10M19 8.5v7" />
    <path d="M3 11v2M21 11v2" />
  </Icon>
)

export const MinusCircleIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </Icon>
)

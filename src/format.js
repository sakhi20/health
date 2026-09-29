export const formatNumber = (n) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 }))

export const formatGrams = (g) => `${formatNumber(g)} g`

export const formatMl = (ml) => `${ml.toLocaleString()} ml`

// "6" -> 6, "6.5" -> 6.5, "" / "abc" / "-1" -> null
export function parseAmount(text) {
  const t = String(text).trim().replace(',', '.')
  return /^(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : null
}

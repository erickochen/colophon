export function fmtInt(n: number | string | null | undefined): string {
  if (n == null) return '–'
  const v = typeof n === 'string' ? Number(n.replace(/,/g, '')) : n
  if (Number.isNaN(v)) return String(n)
  return v.toLocaleString('en-US')
}

export function compact(n: number | null | undefined): string {
  if (n == null) return '–'
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** Server timestamp (UTC) -> relative label like "3h ago". */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso.replace(' ', 'T') + (iso.includes('+') || iso.endsWith('Z') ? '' : 'Z'))
  if (Number.isNaN(t)) return iso
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return iso.slice(0, 10)
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase()
}

/** Ratio: compact above 10k, whole thousands above 100, else 2 decimals. */
export function fmtRatio(r: string | null | undefined): string {
  if (r == null) return '–'
  const n = Number(String(r).replace(/,/g, ''))
  if (Number.isNaN(n)) return String(r)
  if (n >= 10000) return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
  if (n >= 100) return Math.round(n).toLocaleString('en-US')
  return n.toFixed(2)
}

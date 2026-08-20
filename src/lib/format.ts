import { readFeature } from '@/lib/settings'

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

export const MS_PER_SECOND = 1000

/** MAM's stamps are UTC without a zone ("2026-08-20 04:41:32"). Without the Z
 * a browser reads them as local time, which shifts them by hours. */
export function stampMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso.replace(' ', 'T') + (iso.includes('+') || iso.endsWith('Z') ? '' : 'Z'))
  return Number.isNaN(t) ? null : t
}

/** Server timestamp (UTC) -> relative label like "3h ago". */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = stampMs(iso)
  if (t == null) return iso
  const s = Math.max(0, (Date.now() - t) / MS_PER_SECOND)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return iso.slice(0, 10)
}

export function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase()
}

/** Server timestamp without its clock time, so "2026-07-30 08:12:00" reads as a date. */
export function dateOnly(s: string | null | undefined): string {
  return s?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? s ?? ''
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Server timestamp (UTC) rendered in the reader's timezone, same shape as the
 * raw string. With the local-time setting off, the raw UTC string comes back. */
export function localDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  if (!readFeature('localTime')) return iso
  const t = stampMs(iso)
  if (t == null) return iso
  const d = new Date(t)
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  if (!/\d{2}:\d{2}/.test(iso)) return date
  return `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Date part of a UTC timestamp in the reader's timezone. */
export function localDate(iso: string | null | undefined): string {
  if (!iso) return ''
  if (!readFeature('localTime')) return dateOnly(iso)
  const t = stampMs(iso)
  if (t == null) return dateOnly(iso)
  const d = new Date(t)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Clock time of a UTC timestamp in the reader's timezone. */
export function localHm(iso: string | null | undefined): string {
  if (!iso) return ''
  if (!readFeature('localTime')) return iso.slice(11, 16)
  const t = stampMs(iso)
  if (t == null) return iso.slice(11, 16)
  const d = new Date(t)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Tooltip value keeping the exact server stamp reachable. */
export function utcTitle(iso: string | null | undefined): string {
  return iso ? `${iso} UTC` : ''
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

const MAX_CODE_POINT = 0x10ffff

/** Plain text out of an HTML-escaped string. The request search escapes its
 * titles, the torrent search does not. */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? whole
    const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
    return Number.isFinite(code) && code > 0 && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : whole
  })
}

/** Count with its noun, singular at one: "1 member", "12 members". */
export function plural(n: number, word: string): string {
  return `${fmtInt(n)} ${word}${n === 1 ? '' : 's'}`
}

/** Ratio: compact above 10k, whole thousands above 100, else 2 decimals. */
export function fmtRatio(r: number | string | null | undefined): string {
  if (r == null) return '–'
  const n = Number(String(r).replace(/,/g, ''))
  if (Number.isNaN(n)) return String(r)
  if (n >= 10000) return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
  if (n >= 100) return Math.round(n).toLocaleString('en-US')
  return n.toFixed(2)
}

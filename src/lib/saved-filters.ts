// Named filter sets, kept per page. One key holds every page, so the
// preferences tab reads the whole lot in a single go.
import { useCallback, useSyncExternalStore } from 'react'

export const SAVED_FILTERS_KEY = 'colophon:saved-filters'
/** Long enough for a chip summary, short enough to fit a pill. */
export const NAME_MAX = 60
/** What a set filters can run to a dozen parts, so it gets its own headroom
 * rather than the length a pill can carry. */
export const SUMMARY_MAX = 240
/** Beyond this the extra sets move into the More facet on the bar. */
export const PILL_LIMIT = 5
export const SCHEMA = 1

export interface SavedSet {
  id: string
  name: string
  state: Record<string, unknown>
  /** What the filters say, kept beside the name so a renamed set still reads
   * as what it holds. */
  summary?: string
  /** The set this page opens with. At most one per page. */
  pinned?: boolean
  created: number
}

export type SavedPages = Record<string, SavedSet[]>

/** Pages that can hold sets, with the name the preferences card shows. The
 * order here is the order that card lists them in. */
export const SAVED_PAGES: Record<string, string> = {
  browse: 'Browse',
  requests: 'Requests',
  freeleech: 'Freeleech',
  top10: 'Top 10',
  users: 'Members',
  'forum-search': 'Forum search',
}

const listeners = new Set<() => void>()
let cache: SavedPages | null = null

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asSet(raw: unknown): SavedSet | null {
  if (!isPlain(raw)) return null
  const { id, name, state, summary, pinned, created } = raw
  if (typeof id !== 'string' || !id) return null
  if (typeof name !== 'string') return null
  if (!isPlain(state)) return null
  return {
    id,
    name: cleanName(name),
    state,
    ...(typeof summary === 'string' && summary ? { summary: cleanSummary(summary) } : {}),
    ...(pinned === true ? { pinned: true as const } : {}),
    created: typeof created === 'number' && Number.isFinite(created) ? created : 0,
  }
}

/** An unreadable value reads as empty rather than throwing. */
function parse(raw: string | null): SavedPages {
  if (raw == null) return {}
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!isPlain(value) || value.v !== SCHEMA || !isPlain(value.pages)) return {}
  const pages: SavedPages = {}
  for (const [page, list] of Object.entries(value.pages)) {
    if (!Array.isArray(list)) continue
    const sets = list.map(asSet).filter((s): s is SavedSet => s !== null)
    // One pin per page, whatever the stored value claims.
    let seenPin = false
    for (const set of sets) {
      if (!set.pinned) continue
      if (seenPin) delete set.pinned
      seenPin = true
    }
    if (sets.length > 0) pages[page] = sets
  }
  return pages
}

function readAll(): SavedPages {
  if (cache) return cache
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SAVED_FILTERS_KEY)
  } catch {
    raw = null
  }
  cache = parse(raw)
  return cache
}

/** False when the write failed, so the caller can say so out loud. Storage goes
 * first: a cache that moved ahead of it would show a set the next reload has
 * never heard of. */
function writeAll(next: SavedPages): boolean {
  const pages: SavedPages = {}
  for (const [page, sets] of Object.entries(next)) if (sets.length > 0) pages[page] = sets
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify({ v: SCHEMA, pages }))
  } catch {
    return false
  }
  cache = next
  listeners.forEach((l) => l())
  return true
}

/** Drops the cache after an outside write, such as a settings import. */
export function reloadSavedFilters(): void {
  cache = null
  listeners.forEach((l) => l())
}

function flatten(raw: string, max: number): string {
  const flat = raw.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max).trimEnd() : flat
}

export function cleanName(raw: string): string {
  return flatten(raw, NAME_MAX)
}

export function cleanSummary(raw: string): string {
  return flatten(raw, SUMMARY_MAX)
}

/** Key order and array order both vary between renders, so both are settled
 * before two states are compared. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonical)
    const plain = items.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    return plain ? [...items].sort((a, b) => String(a).localeCompare(String(b))) : items
  }
  if (isPlain(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const v = canonical(value[key])
      // An empty pick reads the same as an absent one, so a cleared facet does
      // not make a state look new.
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue
      out[key] = v
    }
    return out
  }
  return value
}

export function sameState(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  }
}

/** One shared empty list. A fresh array per read would hand the store a new
 * snapshot on every render, which React answers with an update loop. */
const NO_SETS: SavedSet[] = []

export function readSets(page: string): SavedSet[] {
  return readAll()[page] ?? NO_SETS
}

export function pinnedSet(page: string): SavedSet | null {
  return readSets(page).find((s) => s.pinned) ?? null
}

/** The set holding these exact filters, for offering an update over a copy. */
export function matchingSet(page: string, state: unknown): SavedSet | null {
  return readSets(page).find((s) => sameState(s.state, state)) ?? null
}

function put(page: string, sets: SavedSet[]): boolean {
  return writeAll({ ...readAll(), [page]: sets })
}

export interface SaveResult {
  ok: boolean
  set: SavedSet
}

export function saveSet(
  page: string,
  name: string,
  state: Record<string, unknown>,
  summary?: string
): SaveResult {
  const set: SavedSet = {
    id: newId(),
    name: cleanName(name),
    state,
    ...(summary ? { summary: cleanSummary(summary) } : {}),
    created: Date.now(),
  }
  return { ok: put(page, [...readSets(page), set]), set }
}

export function updateSet(
  page: string,
  id: string,
  state: Record<string, unknown>,
  summary?: string
): boolean {
  return put(
    page,
    readSets(page).map((s) => (s.id === id ? { ...s, state, ...(summary ? { summary: cleanSummary(summary) } : {}) } : s))
  )
}

export function renameSet(page: string, id: string, name: string): boolean {
  return put(
    page,
    readSets(page).map((s) => (s.id === id ? { ...s, name: cleanName(name) } : s))
  )
}

/** Returns the set that went, so an undo can put it back where it stood. */
export function removeSet(page: string, id: string): { ok: boolean; set: SavedSet | null; at: number } {
  const sets = readSets(page)
  const at = sets.findIndex((s) => s.id === id)
  if (at < 0) return { ok: true, set: null, at: -1 }
  const set = sets[at]
  return { ok: put(page, sets.filter((s) => s.id !== id)), set, at }
}

export function restoreSet(page: string, set: SavedSet, at: number): boolean {
  const sets = readSets(page)
  if (sets.some((s) => s.id === set.id)) return true
  const next = [...sets]
  next.splice(at < 0 || at > next.length ? next.length : at, 0, set)
  // A pin on the returning set only counts while no other set holds one.
  const cleaned = set.pinned && next.some((s) => s.id !== set.id && s.pinned)
    ? next.map((s) => (s.id === set.id ? { ...s, pinned: undefined } : s))
    : next
  return put(page, cleaned)
}

export function setPinned(page: string, id: string, pinned: boolean): boolean {
  return put(
    page,
    readSets(page).map((s) => {
      if (s.id === id) return pinned ? { ...s, pinned: true } : { ...s, pinned: undefined }
      return s.pinned ? { ...s, pinned: undefined } : s
    })
  )
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export interface SavedFilters {
  sets: SavedSet[]
  pinned: SavedSet | null
  save: (name: string, state: Record<string, unknown>, summary?: string) => SaveResult
  update: (id: string, state: Record<string, unknown>, summary?: string) => boolean
  rename: (id: string, name: string) => boolean
  remove: (id: string) => { ok: boolean; set: SavedSet | null; at: number }
  restore: (set: SavedSet, at: number) => boolean
  pin: (id: string, pinned: boolean) => boolean
  matching: (state: unknown) => SavedSet | null
}

export function useSavedFilters(page: string): SavedFilters {
  const sets = useSyncExternalStore(
    subscribe,
    useCallback(() => readSets(page), [page])
  )
  return {
    sets,
    pinned: sets.find((s) => s.pinned) ?? null,
    save: useCallback((name, state, summary) => saveSet(page, name, state, summary), [page]),
    update: useCallback((id, state, summary) => updateSet(page, id, state, summary), [page]),
    rename: useCallback((id, name) => renameSet(page, id, name), [page]),
    remove: useCallback((id) => removeSet(page, id), [page]),
    restore: useCallback((set, at) => restoreSet(page, set, at), [page]),
    pin: useCallback((id, pinned) => setPinned(page, id, pinned), [page]),
    matching: useCallback((state) => matchingSet(page, state), [page]),
  }
}

/** Every page at once, for the preferences card. */
export function useAllSavedFilters(): SavedPages {
  return useSyncExternalStore(subscribe, readAll)
}

// Central store for every Colophon client setting. One localStorage key per
// setting, an absent key means the default. Writes notify subscribers so the
// preferences tab and in-place controls stay in sync.
import { useCallback, useSyncExternalStore } from 'react'
import {
  applyTheme, DARK_SCHEMES, LIGHT_SCHEMES, SCHEME_DARK_KEY, SCHEME_LIGHT_KEY, THEME_KEY,
} from '@/lib/theme'
import { getPortalContainer } from '@/lib/portals'
import { BROWSE_COLS_KEY, BROWSE_FILTERS_KEY, BROWSE_VIEW_KEY } from '@/lib/browse-sticky'
import { COLLAPSED_PREFIX, reloadCollapsed } from '@/lib/collapsed'
import { HIDDEN_SECTIONS_KEY, reloadHiddenSections } from '@/lib/hidden-sections'
import { SAVED_FILTERS_KEY, SCHEMA as SAVED_FILTERS_SCHEMA, reloadSavedFilters } from '@/lib/saved-filters'

export type FeatureKey =
  | 'ratioProtect'
  | 'skipWedgeConfirm'
  | 'otherEditions'
  | 'externalLinks'
  | 'forumSnippet'
  | 'localTime'
  | 'bonusDelta'
  | 'hideSnatched'
  | 'ignoreAction'
  | 'sbMentions'
  | 'sbMutes'
  | 'sbEmphasis'
  | 'sbColors'
  | 'profileNotes'
  | 'giftHistory'
  | 'seriesView'
  | 'seriesBulk'
  | 'notifToasts'
  | 'notifTitle'
  | 'quickShout'
  | 'plainCopy'
  | 'hideHiddenRequesters'
  | 'giftNewest'

interface FeatureDef {
  key: string
  enabledByDefault: boolean
}

export const FEATURES: Record<FeatureKey, FeatureDef> = {
  ratioProtect: { key: 'colophon:ratio-protect', enabledByDefault: true },
  skipWedgeConfirm: { key: 'colophon:skip-wedge-confirm', enabledByDefault: false },
  otherEditions: { key: 'colophon:other-editions', enabledByDefault: true },
  externalLinks: { key: 'colophon:external-links', enabledByDefault: true },
  forumSnippet: { key: 'colophon:forum-snippet', enabledByDefault: true },
  localTime: { key: 'colophon:local-time', enabledByDefault: true },
  bonusDelta: { key: 'colophon:bonus-delta', enabledByDefault: true },
  hideSnatched: { key: 'colophon:hide-snatched', enabledByDefault: false },
  ignoreAction: { key: 'colophon:ignore-action', enabledByDefault: true },
  sbMentions: { key: 'colophon:sb-mentions', enabledByDefault: true },
  sbMutes: { key: 'colophon:sb-mutes', enabledByDefault: true },
  sbEmphasis: { key: 'colophon:sb-emphasis', enabledByDefault: true },
  sbColors: { key: 'colophon:sb-colors', enabledByDefault: false },
  profileNotes: { key: 'colophon:profile-notes', enabledByDefault: true },
  giftHistory: { key: 'colophon:gift-history', enabledByDefault: true },
  seriesView: { key: 'colophon:series-view', enabledByDefault: true },
  seriesBulk: { key: 'colophon:series-bulk', enabledByDefault: true },
  notifToasts: { key: 'colophon:notif-toasts', enabledByDefault: true },
  notifTitle: { key: 'colophon:notif-title', enabledByDefault: true },
  quickShout: { key: 'colophon:quick-shout', enabledByDefault: true },
  plainCopy: { key: 'colophon:plain-copy', enabledByDefault: true },
  hideHiddenRequesters: { key: 'colophon:hide-hidden-requesters', enabledByDefault: false },
  giftNewest: { key: 'colophon:gift-newest', enabledByDefault: false },
}

const RATIO_FLOOR_KEY = 'colophon:ratio-floor'
const IGNORED_KEY = 'colophon:ignored-torrents'
const MUTED_KEY = 'colophon:sb-muted'
const EMPHASIZED_KEY = 'colophon:sb-emphasized'
const NOTES_KEY = 'colophon:user-notes'
const QUICK_SHOUTS_KEY = 'colophon:quick-shouts'
const DEFAULT_THANK_KEY = 'colophon:default-thank'
const DEFAULT_GIFT_KEY = 'colophon:default-gift'
const GIFTED_MEMBERS_KEY = 'colophon:gifted-members'

const listeners = new Set<() => void>()
let revision = 0

function notify(): void {
  revision += 1
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

const getRevision = () => revision

// The revision loop for modules with settings-adjacent state of their own,
// such as the theme keys.
export const subscribeSettings = subscribe
export const settingsRevision = getRevision
export const notifySettings = notify

function rawRead(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function rawWrite(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private mode: the choice lives for this page only
  }
  notify()
}

export function readFeature(k: FeatureKey): boolean {
  const def = FEATURES[k]
  const stored = rawRead(def.key)
  if (stored === 'off') return false
  if (stored === 'on') return true
  return def.enabledByDefault
}

export function writeFeature(k: FeatureKey, v: boolean): void {
  const def = FEATURES[k]
  rawWrite(def.key, v === def.enabledByDefault ? null : v ? 'on' : 'off')
}

export function useFeature(k: FeatureKey): [boolean, (v: boolean) => void] {
  useSyncExternalStore(subscribe, getRevision)
  const set = useCallback((v: boolean) => writeFeature(k, v), [k])
  return [readFeature(k), set]
}

/** The ratio a download may not take you under. Absent means the default;
 * OFF is the reader clearing the field, which locks nothing. */
export const RATIO_FLOOR_DEFAULT = 2
const RATIO_FLOOR_OFF = 'off'

export function readRatioFloor(): number | null {
  const raw = rawRead(RATIO_FLOOR_KEY)
  if (raw === RATIO_FLOOR_OFF) return null
  const v = Number(raw)
  // Only the OFF marker turns the guard off; unreadable text falls back.
  return raw != null && Number.isFinite(v) && v > 0 ? v : RATIO_FLOOR_DEFAULT
}

export function writeRatioFloor(v: number | null): void {
  if (v == null || !Number.isFinite(v) || v <= 0) rawWrite(RATIO_FLOOR_KEY, RATIO_FLOOR_OFF)
  else rawWrite(RATIO_FLOOR_KEY, String(v))
}

export function useRatioFloor(): [number | null, (v: number | null) => void] {
  useSyncExternalStore(subscribe, getRevision)
  return [readRatioFloor(), writeRatioFloor]
}

function readJson<T>(key: string, validate: (raw: unknown) => T | null, fallback: T): T {
  const stored = rawRead(key)
  if (stored == null) return fallback
  try {
    return validate(JSON.parse(stored)) ?? fallback
  } catch {
    return fallback
  }
}

export interface IgnoredTorrent {
  id: number
  title: string | null
}

function validIgnored(raw: unknown): IgnoredTorrent[] | null {
  if (!Array.isArray(raw)) return null
  const out: IgnoredTorrent[] = []
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.id !== 'number' || !Number.isFinite(o.id)) continue
    out.push({ id: o.id, title: typeof o.title === 'string' ? o.title : null })
  }
  return out
}

export function readIgnoredTorrents(): IgnoredTorrent[] {
  return readJson(IGNORED_KEY, validIgnored, [])
}

export function useIgnoredTorrents(): {
  list: IgnoredTorrent[]
  has(id: number): boolean
  add(t: IgnoredTorrent): void
  remove(id: number): void
} {
  useSyncExternalStore(subscribe, getRevision)
  const list = readIgnoredTorrents()
  const add = useCallback((t: IgnoredTorrent) => {
    const now = readIgnoredTorrents()
    if (!now.some((x) => x.id === t.id)) rawWrite(IGNORED_KEY, JSON.stringify([...now, t]))
  }, [])
  const remove = useCallback((id: number) => {
    const next = readIgnoredTorrents().filter((x) => x.id !== id)
    rawWrite(IGNORED_KEY, next.length ? JSON.stringify(next) : null)
  }, [])
  const has = useCallback((id: number) => list.some((x) => x.id === id), [list])
  return { list, has, add, remove }
}

export interface ListedUser {
  uid: string
  name: string
}

export type UserListKind = 'sb-muted' | 'sb-emphasized'

const USER_LIST_KEYS: Record<UserListKind, string> = {
  'sb-muted': MUTED_KEY,
  'sb-emphasized': EMPHASIZED_KEY,
}

function validUsers(raw: unknown): ListedUser[] | null {
  if (!Array.isArray(raw)) return null
  const out: ListedUser[] = []
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.uid !== 'string' || typeof o.name !== 'string') continue
    out.push({ uid: o.uid, name: o.name })
  }
  return out
}

export function readUserList(kind: UserListKind): ListedUser[] {
  return readJson(USER_LIST_KEYS[kind], validUsers, [])
}

export function useUserList(kind: UserListKind): {
  users: ListedUser[]
  has(uid: string): boolean
  add(u: ListedUser): void
  remove(uid: string): void
} {
  useSyncExternalStore(subscribe, getRevision)
  const users = readUserList(kind)
  const add = useCallback(
    (u: ListedUser) => {
      const now = readUserList(kind)
      if (!now.some((x) => x.uid === u.uid)) rawWrite(USER_LIST_KEYS[kind], JSON.stringify([...now, u]))
    },
    [kind]
  )
  const remove = useCallback(
    (uid: string) => {
      const next = readUserList(kind).filter((x) => x.uid !== uid)
      rawWrite(USER_LIST_KEYS[kind], next.length ? JSON.stringify(next) : null)
    },
    [kind]
  )
  const has = useCallback((uid: string) => users.some((x) => x.uid === uid), [users])
  return { users, has, add, remove }
}

export interface QuickShout {
  name: string
  text: string
}

// Keeps the popover scannable and the store small.
export const QUICK_SHOUT_CAP = 50

function validQuickShouts(raw: unknown): QuickShout[] | null {
  if (!Array.isArray(raw)) return null
  const out: QuickShout[] = []
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.name !== 'string' || !o.name.trim() || typeof o.text !== 'string') continue
    out.push({ name: o.name, text: o.text })
  }
  return out
}

export function readQuickShouts(): QuickShout[] {
  return readJson(QUICK_SHOUTS_KEY, validQuickShouts, [])
}

function writeQuickShouts(list: QuickShout[]): void {
  rawWrite(QUICK_SHOUTS_KEY, list.length ? JSON.stringify(list) : null)
}

export function useQuickShouts(): {
  list: QuickShout[]
  save(name: string, text: string): boolean
  remove(name: string): void
  rename(from: string, to: string): boolean
} {
  useSyncExternalStore(subscribe, getRevision)
  const list = readQuickShouts()
  const save = useCallback((name: string, text: string) => {
    const now = readQuickShouts()
    const hit = now.findIndex((s) => s.name === name)
    if (hit >= 0) {
      const next = [...now]
      next[hit] = { name, text }
      writeQuickShouts(next)
      return true
    }
    if (now.length >= QUICK_SHOUT_CAP) return false
    writeQuickShouts([...now, { name, text }])
    return true
  }, [])
  const remove = useCallback((name: string) => {
    writeQuickShouts(readQuickShouts().filter((s) => s.name !== name))
  }, [])
  const rename = useCallback((from: string, to: string) => {
    const now = readQuickShouts()
    if (now.some((s) => s.name === to)) return false
    writeQuickShouts(now.map((s) => (s.name === from ? { ...s, name: to } : s)))
    return true
  }, [])
  return { list, save, remove, rename }
}

export type AmountKind = 'thank' | 'gift'

const AMOUNT_KEYS: Record<AmountKind, string> = {
  thank: DEFAULT_THANK_KEY,
  gift: DEFAULT_GIFT_KEY,
}

/** Raw stored value: a whole number, "max" or empty for off. */
export function readDefaultAmount(kind: AmountKind): string {
  return rawRead(AMOUNT_KEYS[kind]) ?? ''
}

export function writeDefaultAmount(kind: AmountKind, raw: string): void {
  const v = raw.trim()
  rawWrite(AMOUNT_KEYS[kind], v ? v : null)
}

export function useDefaultAmount(kind: AmountKind): [string, (v: string) => void] {
  useSyncExternalStore(subscribe, getRevision)
  const set = useCallback((v: string) => writeDefaultAmount(kind, v), [kind])
  return [readDefaultAmount(kind), set]
}

/** Setting turned into a usable number: "max" takes the ceiling, numbers clamp
 * into the given bounds, anything else is off. */
export function resolveAmount(raw: string | null, min: number, max: number): number | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (/^max$/i.test(v)) return max
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) return null
  return Math.min(max, Math.max(min, n))
}

// New member lists roll off well within this window.
const GIFTED_TTL_DAYS = 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

function validGiftedMembers(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [uid, v] of Object.entries(raw)) {
    if (typeof v !== 'string') continue
    out[uid] = v
  }
  return out
}

/** Gifted uids, with entries past the TTL dropped on read. */
export function readGiftedMembers(): Record<string, string> {
  const all = readJson(GIFTED_MEMBERS_KEY, validGiftedMembers, {})
  const cutoff = Date.now() - GIFTED_TTL_DAYS * MS_PER_DAY
  return Object.fromEntries(
    Object.entries(all).filter(([, at]) => {
      const t = Date.parse(at)
      return Number.isNaN(t) || t >= cutoff
    })
  )
}

export function useGiftedMembers(): { has(uid: string): boolean; add(uid: string): void } {
  useSyncExternalStore(subscribe, getRevision)
  const marks = readGiftedMembers()
  const has = useCallback((uid: string) => uid in marks, [marks])
  const add = useCallback((uid: string) => {
    const next = { ...readGiftedMembers(), [uid]: new Date().toISOString() }
    rawWrite(GIFTED_MEMBERS_KEY, JSON.stringify(next))
  }, [])
  return { has, add }
}

export interface UserNote {
  text: string
  updated: string
}

function validNotes(raw: unknown): Record<string, UserNote> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const out: Record<string, UserNote> = {}
  for (const [uid, v] of Object.entries(raw)) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.text !== 'string' || !o.text.trim()) continue
    out[uid] = { text: o.text, updated: typeof o.updated === 'string' ? o.updated : '' }
  }
  return out
}

export function readUserNotes(): Record<string, UserNote> {
  return readJson(NOTES_KEY, validNotes, {})
}

export function useUserNotes(): {
  notes: Record<string, UserNote>
  setNote(uid: string, text: string): void
  removeNote(uid: string): void
} {
  useSyncExternalStore(subscribe, getRevision)
  const notes = readUserNotes()
  const setNote = useCallback((uid: string, text: string) => {
    const next = { ...readUserNotes() }
    if (text.trim()) next[uid] = { text, updated: new Date().toISOString() }
    else delete next[uid]
    rawWrite(NOTES_KEY, Object.keys(next).length ? JSON.stringify(next) : null)
  }, [])
  const removeNote = useCallback((uid: string) => {
    const next = { ...readUserNotes() }
    delete next[uid]
    rawWrite(NOTES_KEY, Object.keys(next).length ? JSON.stringify(next) : null)
  }, [])
  return { notes, setNote, removeNote }
}

function validStringList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  return raw.filter((v): v is string => typeof v === 'string')
}

function validPlainObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

/** Saved filter sets travel as one envelope, so the shape is checked here plus
 * the sets themselves are checked again when the store reads them. */
function validSavedFilters(raw: unknown): Record<string, unknown> | null {
  const o = validPlainObject(raw)
  if (!o || o.v !== SAVED_FILTERS_SCHEMA) return null
  return validPlainObject(o.pages) ? o : null
}

// Every key export and import cover, with the validator that guards an import.
const VALUE_KEYS: Record<string, (raw: string) => boolean> = {
  [RATIO_FLOOR_KEY]: (raw) => raw === RATIO_FLOOR_OFF || (Number.isFinite(Number(raw)) && Number(raw) > 0),
  [IGNORED_KEY]: (raw) => parses(raw, validIgnored),
  [MUTED_KEY]: (raw) => parses(raw, validUsers),
  [EMPHASIZED_KEY]: (raw) => parses(raw, validUsers),
  [NOTES_KEY]: (raw) => parses(raw, validNotes),
  [QUICK_SHOUTS_KEY]: (raw) => parses(raw, validQuickShouts),
  // The two amount keys hold a plain string rather than JSON.
  [DEFAULT_THANK_KEY]: (raw) => /^max$/i.test(raw.trim()) || (Number.isInteger(Number(raw)) && Number(raw) > 0),
  [DEFAULT_GIFT_KEY]: (raw) => /^max$/i.test(raw.trim()) || (Number.isInteger(Number(raw)) && Number(raw) > 0),
  [GIFTED_MEMBERS_KEY]: (raw) => parses(raw, validGiftedMembers),
  [THEME_KEY]: (raw) => raw === 'light' || raw === 'dark' || raw === 'auto',
  [SCHEME_LIGHT_KEY]: (raw) => (LIGHT_SCHEMES as readonly string[]).includes(raw),
  [SCHEME_DARK_KEY]: (raw) => (DARK_SCHEMES as readonly string[]).includes(raw),
  [BROWSE_VIEW_KEY]: (raw) => raw === 'list' || raw === 'grid',
  [BROWSE_COLS_KEY]: (raw) => parses(raw, validStringList),
  [BROWSE_FILTERS_KEY]: (raw) => parses(raw, validPlainObject),
  [HIDDEN_SECTIONS_KEY]: (raw) => parses(raw, validStringList),
  [SAVED_FILTERS_KEY]: (raw) => parses(raw, validSavedFilters),
}

// Theme writes need a repaint on top of the store notify.
const THEME_KEYS: ReadonlySet<string> = new Set([THEME_KEY, SCHEME_LIGHT_KEY, SCHEME_DARK_KEY])

function parses(raw: string, validate: (v: unknown) => unknown | null): boolean {
  try {
    return validate(JSON.parse(raw)) != null
  } catch {
    return false
  }
}

const EXPORT_APP = 'colophon'
const EXPORT_KIND = 'settings'
const EXPORT_VERSION = 1

export function exportSettings(): string {
  const values: Record<string, string> = {}
  for (const def of Object.values(FEATURES)) {
    const v = rawRead(def.key)
    if (v != null) values[def.key] = v
  }
  for (const key of Object.keys(VALUE_KEYS)) {
    const v = rawRead(key)
    if (v != null) values[key] = v
  }
  // Folded sections live under one key per page, so they travel as a family.
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(COLLAPSED_PREFIX)) continue
      const v = rawRead(key)
      if (v != null) values[key] = v
    }
  } catch {
    // private mode
  }
  return JSON.stringify({ app: EXPORT_APP, kind: EXPORT_KIND, version: EXPORT_VERSION, values }, null, 2)
}

/** Writes only keys the schema knows; anything else is counted as skipped. */
export function importSettings(json: string): { applied: number; skipped: number } {
  const parsed: unknown = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Not a settings file')
  const o = parsed as Record<string, unknown>
  if (o.app !== EXPORT_APP || o.kind !== EXPORT_KIND) throw new Error('Not a Colophon settings file')
  if (typeof o.values !== 'object' || o.values === null) throw new Error('Not a Colophon settings file')
  const featureKeys = new Set(Object.values(FEATURES).map((d) => d.key))
  let applied = 0
  let skipped = 0
  let themeTouched = false
  let collapsedTouched = false
  let hiddenTouched = false
  let savedTouched = false
  for (const [key, value] of Object.entries(o.values as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      skipped += 1
      continue
    }
    if (featureKeys.has(key)) {
      if (value === 'on' || value === 'off') {
        rawWrite(key, value)
        applied += 1
      } else skipped += 1
      continue
    }
    if (key.startsWith(COLLAPSED_PREFIX)) {
      if (parses(value, validStringList)) {
        rawWrite(key, value)
        applied += 1
        collapsedTouched = true
      } else skipped += 1
      continue
    }
    const check = VALUE_KEYS[key]
    if (check && check(value)) {
      rawWrite(key, value)
      applied += 1
      if (THEME_KEYS.has(key)) themeTouched = true
      if (key === HIDDEN_SECTIONS_KEY) hiddenTouched = true
      if (key === SAVED_FILTERS_KEY) savedTouched = true
    } else skipped += 1
  }
  if (themeTouched) applyTheme(getPortalContainer())
  // These modules cache reads, so an import has to push the new state through.
  if (collapsedTouched) reloadCollapsed()
  if (hiddenTouched) reloadHiddenSections()
  if (savedTouched) reloadSavedFilters()
  return { applied, skipped }
}

/** Puts every known key back to its default. The theme and the cached modules
 * repaint right away. */
export function clearAllSettings(): void {
  for (const def of Object.values(FEATURES)) rawWrite(def.key, null)
  for (const key of Object.keys(VALUE_KEYS)) rawWrite(key, null)
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(COLLAPSED_PREFIX)) rawWrite(key, null)
    }
  } catch {
    // private mode
  }
  applyTheme(getPortalContainer())
  reloadCollapsed()
  reloadHiddenSections()
  reloadSavedFilters()
}

/** Puts a snapshot from exportSettings back, defaults first, so keys the
 * snapshot does not name return to their default too. */
export function restoreSettings(json: string): void {
  clearAllSettings()
  importSettings(json)
}

const LEGACY_PREFIX = 'muisstil:'
const CURRENT_PREFIX = 'colophon:'

/** One-time rename of old keys. Copies when the new key is absent, then removes
 * the old key, in both storages. */
export function migrateLegacyKeys(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(LEGACY_PREFIX)) continue
      const next = CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length)
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key) ?? '')
      localStorage.removeItem(key)
    }
  } catch {
    // private mode
  }
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (!key.startsWith(LEGACY_PREFIX)) continue
      const next = CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length)
      if (sessionStorage.getItem(next) === null) sessionStorage.setItem(next, sessionStorage.getItem(key) ?? '')
      sessionStorage.removeItem(key)
    }
  } catch {
    // private mode
  }
}

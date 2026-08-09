// Central store for every Colophon client setting. One localStorage key per
// setting, an absent key means the default. Writes notify subscribers so the
// preferences tab and in-place controls stay in sync.
import { useCallback, useSyncExternalStore } from 'react'

export type FeatureKey =
  | 'ratioProtect'
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

interface FeatureDef {
  key: string
  enabledByDefault: boolean
}

export const FEATURES: Record<FeatureKey, FeatureDef> = {
  ratioProtect: { key: 'colophon:ratio-protect', enabledByDefault: true },
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
}

const RATIO_FLOOR_KEY = 'colophon:ratio-floor'
const IGNORED_KEY = 'colophon:ignored-torrents'
const MUTED_KEY = 'colophon:sb-muted'
const EMPHASIZED_KEY = 'colophon:sb-emphasized'
const NOTES_KEY = 'colophon:user-notes'

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

/** Personal minimum ratio; null means only the hard floor applies. */
export function readRatioFloor(): number | null {
  const v = Number(rawRead(RATIO_FLOOR_KEY))
  return Number.isFinite(v) && v > 0 ? v : null
}

export function writeRatioFloor(v: number | null): void {
  if (v == null || !Number.isFinite(v) || v <= 0) rawWrite(RATIO_FLOOR_KEY, null)
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

// Every key export and import cover, with the validator that guards an import.
const VALUE_KEYS: Record<string, (raw: string) => boolean> = {
  [RATIO_FLOOR_KEY]: (raw) => Number.isFinite(Number(raw)) && Number(raw) > 0,
  [IGNORED_KEY]: (raw) => parses(raw, validIgnored),
  [MUTED_KEY]: (raw) => parses(raw, validUsers),
  [EMPHASIZED_KEY]: (raw) => parses(raw, validUsers),
  [NOTES_KEY]: (raw) => parses(raw, validNotes),
}

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
    const check = VALUE_KEYS[key]
    if (check && check(value)) {
      rawWrite(key, value)
      applied += 1
    } else skipped += 1
  }
  return { applied, skipped }
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

// Which torrents this member already holds, plus how each one stands. MAM has
// no endpoint that answers that per torrent: the search API's my_snatched runs
// 5 to 20 minutes behind and carries no seeding state. So the piles from
// /snatch_summary.php are the source, read once and kept.
import { mamFetch, sessionToken } from '@/lib/mam-fetch'
import { MS_PER_SECOND } from '@/lib/format'
import { readPile } from '@/lib/snatch-status'

/** MAM pages its own snatch lists at this size. */
const PILE_PAGE = 1000
/** Ten pages per pile: a stop for a runaway answer, not a real ceiling. */
const PILE_PAGES_MAX = 10
const PILE_MAX = PILE_PAGES_MAX * PILE_PAGE
/** The pile counts catch a changed list on their own. This is the backstop for
 * the case where two changes land a count back on its old number. */
const INDEX_TTL_MS = 60 * 60 * 1000
/** Past a week the stored map describes a library that has moved on, so it is
 * not worth painting badges from while a refresh is failing. */
const INDEX_STALE_MS = 7 * 24 * 60 * 60 * 1000
const INDEX_KEY = 'colophon:snatch-index'
const PILES_URL = '/snatch_summary.php'
const ROWS_URL = 'https://cdn.myanonamouse.net/json/loadUserDetailsTorrents.php'

export interface SnatchIndex {
  /** Torrent id to the pile it sits in, as MAM names that pile. */
  have: Map<number, string>
  /** When the piles were read, in milliseconds. */
  at: number
  /** True when a pile hit the page cap, so its tail is missing from the map. */
  partial: boolean
}

interface Pile {
  type: string
  uid: string
  count: number
  name: string
}

interface Stored {
  fingerprint: string
  at: number
  partial: boolean
  piles: { name: string; ids: number[] }[]
}

/** Every non-empty pile carries the attributes MAM's own click handler reads.
 * An empty one is a heading with a zero, so it never reaches the cdn. */
function readPiles(doc: Document): Pile[] {
  const out: Pile[] = []
  for (const el of doc.querySelectorAll('[data-udTorType]')) {
    const [uid, count] = (el.getAttribute('data-udTorData') ?? '').split(',')
    const name = (el.textContent ?? '')
      .replace(el.querySelector('.ssCount')?.textContent ?? '', '')
      .replace(/\s+/g, ' ')
      .trim()
    // The cap row counts torrents a real pile already holds.
    if (readPile(name).cap) continue
    const type = el.getAttribute('data-udTorType') ?? ''
    if (type && uid && Number(count) > 0) out.push({ type, uid, count: Number(count), name })
  }
  return out
}

const fingerprintOf = (piles: Pile[]) => piles.map((p) => `${p.type}:${p.count}`).sort().join('|')

async function readPileRows(p: Pile): Promise<{ ids: number[]; partial: boolean }> {
  const ids: number[] = []
  const want = Math.min(p.count, PILE_MAX)
  // Set where the pile runs out on its own, which is the one exit that leaves
  // nothing behind. Both other exits are ceilings, so their tail is missing.
  let whole = false
  // The page count is the ceiling, not the id count: a full page of rows this
  // reader cannot use would otherwise never reach `want`.
  for (let iteration = 0; ids.length < want && iteration < PILE_PAGES_MAX; iteration += 1) {
    const q = new URLSearchParams({
      uid: p.uid,
      iteration: String(iteration),
      type: p.type,
      cacheTime: String(Math.floor(Date.now() / MS_PER_SECOND)),
      mbsc: sessionToken(),
    })
    const res = await mamFetch(`${ROWS_URL}?${q.toString()}`, { credentials: 'include' })
    if (!res.ok) throw new Error(`Snatch list refused (${res.status})`)
    const json: unknown = await res.json()
    const body = json as { success?: unknown; error?: unknown; rows?: unknown }
    if (body.success === false) throw new Error(String(body.error ?? 'Snatch list refused'))
    const rows = Array.isArray(body.rows) ? body.rows : []
    for (const r of rows) {
      const id = Number((r as { id?: unknown }).id)
      if (Number.isFinite(id)) ids.push(id)
    }
    if (rows.length < PILE_PAGE) {
      whole = true
      break
    }
  }
  // A pile the summary counts that answers with nothing is a gap, not a
  // complete pile: a torrent can move pile between the two calls. It rides
  // along as partial rather than throwing away every pile that did answer.
  if (p.count > 0 && ids.length === 0) return { ids, partial: true }
  // Complete means the pile ran out on its own. Handing over every id its count
  // promised counts too. Short of that, a ceiling stopped it with a tail behind.
  return { ids, partial: !whole && ids.length < p.count }
}

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Stored
    if (typeof o?.fingerprint !== 'string' || typeof o.at !== 'number' || !Array.isArray(o.piles)) return null
    return o
  } catch {
    return null
  }
}

function toIndex(o: Stored): SnatchIndex {
  const have = new Map<number, string>()
  for (const pile of o.piles) {
    if (!Array.isArray(pile?.ids)) continue
    for (const id of pile.ids) have.set(id, pile.name)
  }
  return { have, at: o.at, partial: !!o.partial }
}

/** The stored index without touching the network, as long as it is recent
 * enough to describe today. Null when there is none. */
export function cachedSnatchIndex(): SnatchIndex | null {
  const stored = readStored()
  if (!stored || Date.now() - stored.at > INDEX_STALE_MS) return null
  return toIndex(stored)
}

let inflight: Promise<SnatchIndex> | null = null

/** Reads the piles, then serves the cache when nothing changed. One cheap
 * request on a warm visit, one per pile on a cold one. */
export function loadSnatchIndex(): Promise<SnatchIndex> {
  inflight ??= run().finally(() => {
    inflight = null
  })
  return inflight
}

async function run(): Promise<SnatchIndex> {
  const res = await mamFetch(PILES_URL, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`Snatch summary refused (${res.status})`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const piles = readPiles(doc)
  const fingerprint = fingerprintOf(piles)

  const stored = readStored()
  if (stored && stored.fingerprint === fingerprint && Date.now() - stored.at < INDEX_TTL_MS) {
    return toIndex(stored)
  }

  const next: Stored = { fingerprint, at: Date.now(), partial: false, piles: [] }
  let counted = 0
  for (const p of piles) {
    const { ids, partial } = await readPileRows(p)
    next.piles.push({ name: p.name, ids })
    counted += p.count
    if (partial) next.partial = true
  }
  // Every pile empty while the summary counted torrents is a shape this reader
  // does not understand. Caching that would read as "you hold none of these"
  // for a whole TTL, so it throws plus the next visit tries again.
  const total = next.piles.reduce((n, pile) => n + pile.ids.length, 0)
  if (counted > 0 && total === 0) throw new Error('Snatch lists came back unreadable')
  // A throw above leaves the old cache in place, so the next visit tries again.
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(next))
  } catch {
    // private mode or a list past the quota. This visit still has its map.
  }
  return toIndex(next)
}

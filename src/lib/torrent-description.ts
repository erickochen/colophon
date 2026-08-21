import { searchTorrents } from '@/lib/mam-api'

// The smallest page this endpoint documents. The id picks out one row anyway.
const PAGE_MIN = 5
// Floor between two of these calls. MAM answers a hammered search with a 403 and
// can put the whole session out, so reading down a list of covers stays slow.
const MIN_GAP_MS = 400

const cache = new Map<number, string>()
const running = new Map<number, Promise<string>>()

let queue: Promise<unknown> = Promise.resolve()
let lastAt = 0

/** One of these at a time, spaced by the floor above. */
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastAt)
    if (wait > 0) await new Promise((settle) => setTimeout(settle, wait))
    lastAt = Date.now()
    return job()
  })
  queue = run.catch(() => undefined)
  return run
}

/** Whatever is already known about a torrent. A preview card is torn down every
 * time it closes, so reading the answer straight away keeps a second look from
 * flashing its loading state. */
export function knownDescription(id: number): string | null {
  return cache.get(id) ?? null
}

/** The blurb for one torrent, as the uploader wrote it. The newer search
 * endpoint leaves the field out, so this asks the classic one for a single row,
 * which answers whether or not the account shows descriptions in its search.
 * Answers are kept for the session, so a second look costs nothing. */
export async function torrentDescription(id: number): Promise<string> {
  const kept = cache.get(id)
  if (kept != null) return kept

  const inFlight = running.get(id)
  if (inFlight) return inFlight

  const ask = queued(async () => {
    const res = await searchTorrents({ id, perpage: PAGE_MIN }, { description: true })
    const row = res.data.find((r) => Number(r.id) === id)
    // An answer without the row is a refusal dressed as success, so nothing is
    // kept and the next look asks again. An empty blurb on a row that is there
    // is an answer, which is why the two cases are told apart.
    if (!row) throw new Error('the search did not return this torrent')
    const text = String(row.description ?? '').trim()
    cache.set(id, text)
    return text
  })

  running.set(id, ask)
  try {
    return await ask
  } finally {
    running.delete(id)
  }
}

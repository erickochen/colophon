// The browse filters a reader keeps coming back to. Stored per browser and
// seeded once from the defaults MAM renders into its own browse form.

const KEY = 'muisstil:browse-filters'

export interface StickyFilters {
  mainCat: number[]
  cat: number[]
  langs: number[]
  flagsMode: 0 | 1
  flags: number[]
  sort?: string
  perpage?: number
}

const ids = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n > 0) : []

/** null when nothing was ever stored, so a first visit can fall back to MAM. An
 * empty set is a real answer: it means the reader cleared their filters. */
export function readSticky(): StickyFilters | null {
  let raw: unknown
  try {
    const stored = localStorage.getItem(KEY)
    if (stored == null) return null
    raw = JSON.parse(stored)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  return {
    mainCat: ids(o.mainCat),
    cat: ids(o.cat),
    langs: ids(o.langs),
    flagsMode: o.flagsMode === 1 ? 1 : 0,
    flags: ids(o.flags),
    sort: typeof o.sort === 'string' ? o.sort : undefined,
    perpage: Number(o.perpage) > 0 ? Number(o.perpage) : undefined,
  }
}

export function writeSticky(f: StickyFilters): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    /* private mode: the filters just do not survive the session */
  }
}

/** MAM's saved browse defaults, read straight from the hidden legacy form: the
 * categories from Preferences > Torrent Search plus the saved sort. The search
 * API ignores both, so this form is the only place they surface. */
export function mamBrowseDefaults(): Pick<StickyFilters, 'cat' | 'sort'> | null {
  const form = document.querySelector('#torSearch')
  if (!form) return null
  const cat = [...form.querySelectorAll<HTMLInputElement>('input[name="tor[cat][]"]:checked')]
    .map((el) => Number(el.value))
    .filter((n) => n > 0)
  const sort = form.querySelector<HTMLInputElement>('#sortType')?.value
  return { cat, sort: sort || undefined }
}

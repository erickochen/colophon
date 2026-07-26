// Which dashboard sections the reader dismissed. MAM itself can only reorder
// front-page blocks (style[Front Page][Order][...]) and hide the header news
// ticker, so there is no server-side flag to mirror - we keep the set locally.
import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'muisstil:hidden-sections'

const listeners = new Set<() => void>()
let cache: string[] | null = null

function read(): string[] {
  if (cache) return cache
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    cache = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
  } catch {
    cache = []
  }
  return cache
}

function write(next: string[]) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode: the choice just does not survive the session */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export interface HiddenSections {
  hidden: string[]
  isHidden: (id: string) => boolean
  hide: (id: string) => void
  show: (id: string) => void
  showAll: () => void
}

export function useHiddenSections(): HiddenSections {
  const hidden = useSyncExternalStore(subscribe, read)
  const hide = useCallback((id: string) => {
    if (!read().includes(id)) write([...read(), id])
  }, [])
  const show = useCallback((id: string) => write(read().filter((v) => v !== id)), [])
  const showAll = useCallback(() => write([]), [])
  return { hidden, isHidden: (id) => hidden.includes(id), hide, show, showAll }
}

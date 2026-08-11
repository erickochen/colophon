// Which sections a reader folded away, kept per page key so a long list stays
// the shape they left it in.
import { useCallback, useSyncExternalStore } from 'react'

export const COLLAPSED_PREFIX = 'colophon:collapsed:'

const listeners = new Set<() => void>()
const cache = new Map<string, string[]>()

/** Drops the cache after an outside write, such as a settings import. */
export function reloadCollapsed(): void {
  cache.clear()
  listeners.forEach((l) => l())
}

function read(page: string): string[] {
  const hit = cache.get(page)
  if (hit) return hit
  let value: string[] = []
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_PREFIX + page) ?? '[]')
    if (Array.isArray(raw)) value = raw.filter((v): v is string => typeof v === 'string')
  } catch {
    value = []
  }
  cache.set(page, value)
  return value
}

function write(page: string, next: string[]) {
  cache.set(page, next)
  try {
    localStorage.setItem(COLLAPSED_PREFIX + page, JSON.stringify(next))
  } catch {
    /* private mode: the choice just does not survive the session */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export interface CollapsedSections {
  collapsed: string[]
  isOpen: (key: string) => boolean
  setOpen: (key: string, open: boolean) => void
  openAll: () => void
  closeAll: (keys: string[]) => void
}

export function useCollapsed(page: string): CollapsedSections {
  const collapsed = useSyncExternalStore(
    subscribe,
    useCallback(() => read(page), [page])
  )
  const setOpen = useCallback(
    (key: string, open: boolean) => {
      const now = read(page)
      if (open) write(page, now.filter((k) => k !== key))
      else if (!now.includes(key)) write(page, [...now, key])
    },
    [page]
  )
  return {
    collapsed,
    isOpen: (key) => !collapsed.includes(key),
    setOpen,
    openAll: useCallback(() => write(page, []), [page]),
    closeAll: useCallback((keys: string[]) => write(page, [...new Set(keys)]), [page]),
  }
}

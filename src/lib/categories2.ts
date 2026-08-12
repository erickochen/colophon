// MAM's new-search taxonomy, served as one JS assignment. Fetched once per
// session; the session cache keeps repeat visits off the endpoint.
import { useEffect, useState } from 'react'

export interface Category2 {
  id: number
  name: string
  mainTypes: number[]
  mediaTypes: number[]
}

const CACHE_KEY = 'colophon:categories2'
const SOURCE_URL = '/tor/json/categories.php?new&js'
const ASSIGNMENT_PREFIX = 'var categoryDefinitions = '

interface RawCategory {
  id: string
  name: string
  main_type_ids: number[]
  media_type_ids: number[]
}

function parseDefinitions(text: string): Category2[] {
  const start = text.indexOf(ASSIGNMENT_PREFIX)
  if (start < 0) return []
  const json = text.slice(start + ASSIGNMENT_PREFIX.length).replace(/;\s*$/, '')
  try {
    const parsed = JSON.parse(json) as { categories?: Record<string, RawCategory> }
    return Object.values(parsed.categories ?? {})
      .map((c) => ({
        id: Number(c.id),
        name: String(c.name),
        mainTypes: Array.isArray(c.main_type_ids) ? c.main_type_ids.map(Number) : [],
        mediaTypes: Array.isArray(c.media_type_ids) ? c.media_type_ids.map(Number) : [],
      }))
      .filter((c) => c.id > 0 && c.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

let inFlight: Promise<Category2[]> | null = null

export function loadCategories2(): Promise<Category2[]> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) return Promise.resolve(JSON.parse(cached) as Category2[])
  } catch {
    // storage may be unavailable
  }
  inFlight ??= fetch(SOURCE_URL, { credentials: 'include' })
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`categories failed: ${res.status}`))))
    .then((text) => {
      const cats = parseDefinitions(text)
      if (cats.length) {
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(cats))
        } catch {
          // storage may be unavailable
        }
      }
      return cats
    })
    .catch(() => [])
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** null while loading, then the list; an empty list means the fetch failed. */
export function useCategories2(): Category2[] | null {
  const [cats, setCats] = useState<Category2[] | null>(null)
  useEffect(() => {
    let live = true
    void loadCategories2().then((c) => {
      if (live) setCats(c)
    })
    return () => {
      live = false
    }
  }, [])
  return cats
}

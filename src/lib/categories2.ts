// MAM's new-search taxonomy, served as one JS assignment. Fetched once per
// session; the session cache keeps repeat visits off the endpoint.
import { useEffect, useState } from 'react'

export interface Category2 {
  id: number
  name: string
  mainTypes: number[]
  mediaTypes: number[]
  /** Genres MAM expects alongside this one, like Fantasy under Urban Fantasy. */
  requires: number[]
  /** Genres that cannot be picked together with this one. */
  excludes: number[]
}

export interface Taxonomy2 {
  categories: Category2[]
  mediaTypes: { id: number; name: string }[]
  mainTypes: { id: number; name: string }[]
}

const CACHE_KEY = 'colophon:categories2:v2'
const SOURCE_URL = '/tor/json/categories.php?new&js'
const ASSIGNMENT_PREFIX = 'var categoryDefinitions = '

interface RawCategory {
  id: string
  name: string
  main_type_ids: number[]
  media_type_ids: number[]
  required_siblings?: number[]
  excluded_siblings?: number[]
}

interface RawType {
  id: string
  name: string
}

const numbers = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => n > 0) : [])

function parseTypes(raw: Record<string, RawType> | undefined): { id: number; name: string }[] {
  return Object.values(raw ?? {})
    .map((t) => ({ id: Number(t.id), name: String(t.name) }))
    .filter((t) => t.id > 0 && t.name)
    .sort((a, b) => a.id - b.id)
}

function parseDefinitions(text: string): Taxonomy2 {
  const empty: Taxonomy2 = { categories: [], mediaTypes: [], mainTypes: [] }
  const start = text.indexOf(ASSIGNMENT_PREFIX)
  if (start < 0) return empty
  const json = text.slice(start + ASSIGNMENT_PREFIX.length).replace(/;\s*$/, '')
  try {
    const parsed = JSON.parse(json) as {
      categories?: Record<string, RawCategory>
      media_types?: Record<string, RawType>
      main_types?: Record<string, RawType>
    }
    return {
      categories: Object.values(parsed.categories ?? {})
        .map((c) => ({
          id: Number(c.id),
          name: String(c.name),
          mainTypes: numbers(c.main_type_ids),
          mediaTypes: numbers(c.media_type_ids),
          requires: numbers(c.required_siblings),
          excludes: numbers(c.excluded_siblings),
        }))
        .filter((c) => c.id > 0 && c.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
      mediaTypes: parseTypes(parsed.media_types),
      mainTypes: parseTypes(parsed.main_types),
    }
  } catch {
    return empty
  }
}

const EMPTY: Taxonomy2 = { categories: [], mediaTypes: [], mainTypes: [] }

let inFlight: Promise<Taxonomy2> | null = null

export function loadTaxonomy2(): Promise<Taxonomy2> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) return Promise.resolve(JSON.parse(cached) as Taxonomy2)
  } catch {
    // storage may be unavailable
  }
  inFlight ??= fetch(SOURCE_URL, { credentials: 'include' })
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`categories failed: ${res.status}`))))
    .then((text) => {
      const tax = parseDefinitions(text)
      if (tax.categories.length) {
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(tax))
        } catch {
          // storage may be unavailable
        }
      }
      return tax
    })
    .catch(() => EMPTY)
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function loadCategories2(): Promise<Category2[]> {
  return loadTaxonomy2().then((t) => t.categories)
}

/** null while loading, then the taxonomy; empty lists mean the fetch failed. */
export function useTaxonomy2(): Taxonomy2 | null {
  const [tax, setTax] = useState<Taxonomy2 | null>(null)
  useEffect(() => {
    let live = true
    void loadTaxonomy2().then((t) => {
      if (live) setTax(t)
    })
    return () => {
      live = false
    }
  }, [])
  return tax
}

/** null while loading, then the list; an empty list means the fetch failed. */
export function useCategories2(): Category2[] | null {
  return useTaxonomy2()?.categories ?? null
}

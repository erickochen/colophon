// MAM's tag field is free text, so it also collects encoder notes and release
// dates. Splitting follows MAM+ so both scripts pick out the same tags.

// Longer runs read as a description rather than a tag.
const TAG_MAX_LEN = 30
// A single character searches nothing useful.
const TAG_MIN_LEN = 2
// Brackets and these characters end a tag.
const BOUNDARY = /[;,>|[\]()]/

export interface TagSegment {
  text: string
  /** Short enough to pass as a tag, so it gets a search link. */
  searchable: boolean
}

/** Every part of the field in the order it appears. Searchable parts drop
 * repeats; the rest carry release notes and stay as they were written. */
export function parseSegments(raw: string | null | undefined): TagSegment[] {
  if (!raw) return []
  const seen = new Set<string>()
  const segments: TagSegment[] = []
  for (const part of raw.split(BOUNDARY)) {
    const text = part.trim().replace(/\s+/g, ' ')
    if (!text) continue
    const searchable = text.length >= TAG_MIN_LEN && text.length <= TAG_MAX_LEN
    if (searchable) {
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
    }
    segments.push({ text, searchable })
  }
  return segments
}

/** Tags worth linking, in the order they appear, without repeats. */
export function parseTags(raw: string | null | undefined): string[] {
  return parseSegments(raw).filter((s) => s.searchable).map((s) => s.text)
}

/** Exact-phrase search over the tag field. Quoting narrows multi-word tags, so
 * a quote inside the tag has to go or the phrase falls apart. */
export function tagSearchHref(tag: string): string {
  const p = new URLSearchParams()
  p.set('tor[text]', `"${tag.replace(/"/g, '')}"`)
  p.set('tor[srchIn][tags]', 'true')
  return `/tor/browse.php?${p}`
}

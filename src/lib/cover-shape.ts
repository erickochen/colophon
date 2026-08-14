// Which frame a cover gets. MAM's audiobook and radio art is square while
// everything else is portrait, so the frame follows the media, not the page.
export type CoverShape = 'portrait' | 'square'

// MAM media type ids: 1 Audiobook, 4 Radio.
const SQUARE_MEDIA_TYPES: ReadonlySet<number> = new Set([1, 4])
// MAM main categories: 13 AudioBooks, 16 Radio. Rougher than media type, so
// only used where a page knows nothing finer.
const SQUARE_MAIN_CATS: ReadonlySet<number> = new Set([13, 16])

// Width over height. A frame reserves one of these while a loaded cover reports
// its own; the smaller of the two decides how much of the frame it fills.
export const COVER_ASPECT: Record<CoverShape, number> = {
  portrait: 3 / 4.5,
  square: 1,
}

/** Media type wins when a row carries one, category is the fallback. */
export function coverShape(input: {
  mediatype?: number | string | null
  mainCat?: number | null
}): CoverShape {
  const mt = input.mediatype == null ? null : Number(input.mediatype)
  if (mt != null && Number.isFinite(mt)) return SQUARE_MEDIA_TYPES.has(mt) ? 'square' : 'portrait'
  if (input.mainCat != null) return SQUARE_MAIN_CATS.has(input.mainCat) ? 'square' : 'portrait'
  return 'portrait'
}

/** A torrent page names its media type through the category icon link, which
 * points at /tor/mediaType.php?mid=<n>. */
export function mediaTypeFromHref(href: string | null | undefined): number | null {
  const hit = href ? /[?&]mid=(\d+)/.exec(href) : null
  return hit ? Number(hit[1]) : null
}

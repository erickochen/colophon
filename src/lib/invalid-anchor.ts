// Maps an original (hidden) form control to the rendered row that mirrors it.
// A browser refuses to focus a hidden invalid control, so without this map a
// failed validity check has nothing visible to point at.

import { scrollIntoView } from '@/lib/motion'

interface Anchor {
  node: () => HTMLElement | null
  mark: (message: string) => void
}

const anchors = new Map<HTMLElement, Anchor>()

export function registerInvalidAnchor(el: HTMLElement, anchor: Anchor): () => void {
  anchors.set(el, anchor)
  return () => {
    if (anchors.get(el) === anchor) anchors.delete(el)
  }
}

/** The browser's own wording for what is wrong with this control. */
export function validationHint(el: HTMLElement): string {
  const msg = (el as HTMLInputElement).validationMessage
  return msg || 'Not in a format this field accepts'
}

/** Marks every registered row that mirrors an invalid control and scrolls the
 * first one into view. Returns how many rows were marked. */
export function markInvalid(bad: HTMLElement[]): number {
  let scrolled = false
  let marked = 0
  for (const el of bad) {
    const anchor = anchors.get(el)
    if (!anchor) continue
    anchor.mark(validationHint(el))
    if (!scrolled) {
      scrollIntoView(anchor.node(), { block: 'center' })
      scrolled = true
    }
    marked++
  }
  return marked
}

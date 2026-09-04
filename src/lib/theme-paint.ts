// Kept out of theme.ts on purpose: that module stays light on imports so the
// boot guard can load it first. This one needs the mounted root.
import { HIGH_CLASS } from '@/lib/contrast-mode'
import { getPortalContainer } from '@/lib/portals'

const watchers = new Set<() => void>()
let observer: MutationObserver | null = null
let painted = ''

/** What a fragment has to be measured against: which side is painted plus how
 * hard the contrast bar sits. Both live on the root as a class. */
const paintKey = (root: HTMLElement) =>
  `${root.classList.contains('dark')}|${root.classList.contains(HIGH_CLASS)}`

/** Calls back when the paper changes under a fragment, which is a light or dark
 * flip plus a move of the contrast bar. Schemes within one side leave the paper
 * close enough to skip, so walking the scheme list with the arrow keys never
 * redraws what a reader has open. */
export function onPaintChange(fn: () => void): () => void {
  const root = getPortalContainer()
  watchers.add(fn)
  if (!observer) {
    painted = paintKey(root)
    observer = new MutationObserver(() => {
      const now = paintKey(root)
      if (now === painted) return
      painted = now
      watchers.forEach((w) => w())
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
  }
  return () => {
    watchers.delete(fn)
    if (watchers.size === 0) {
      observer?.disconnect()
      observer = null
    }
  }
}

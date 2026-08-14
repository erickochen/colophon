// Kept out of theme.ts on purpose: that module stays import-free so the boot
// guard can load it first. This one needs the mounted root.
import { getPortalContainer } from '@/lib/portals'

const watchers = new Set<() => void>()
let observer: MutationObserver | null = null
let dark = false

/** Calls back when the painted side flips between light and dark. Schemes
 * within one side leave the paper close enough to skip, so walking the scheme
 * list with the arrow keys never redraws what a reader has open. */
export function onThemeSide(fn: () => void): () => void {
  const root = getPortalContainer()
  watchers.add(fn)
  if (!observer) {
    dark = root.classList.contains('dark')
    observer = new MutationObserver(() => {
      const now = root.classList.contains('dark')
      if (now === dark) return
      dark = now
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

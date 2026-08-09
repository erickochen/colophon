// Hides the page until our shell paints, so MAM's layout never shows through.
// The loader puts the veil up; the payload finds it in place and leaves it be.
import { PAGE_BG, pageBg } from '@/lib/theme'

const GUARD_ID = 'colophon-guard'

// Set on <html> once the page has been handed back, so a second bundle in the
// same document does not hide a page the reader is already looking at. It lives
// in the DOM because the loader and the payload hold separate module state.
const REVEALED_ATTR = 'data-mam-revealed'

// If our boot never reaches revealPage (a throw in MAM markup we misread), the
// page comes back on its own rather than staying blank.
const REVEAL_FAILSAFE_MS = 4000

let failsafe = 0

/** At document-start <html> may not exist yet, so run as soon as it does. */
export function whenDocumentElement(fn: () => void) {
  if (document.documentElement) {
    fn()
    return
  }
  const obs = new MutationObserver(() => {
    if (document.documentElement) {
      obs.disconnect()
      fn()
    }
  })
  obs.observe(document, { childList: true, subtree: true })
}

/** Paint our own page colour behind the veil: visibility:hidden still fills the
 * canvas from the root background, so the wait reads as our page loading. */
function veilCss(): string {
  let bg: string = PAGE_BG.light
  try {
    bg = pageBg()
  } catch {
    // Storage or matchMedia blocked: light is the safer default.
  }
  return `html{visibility:hidden!important;background:${bg}!important}`
}

export function hidePage(): void {
  whenDocumentElement(() => {
    if (document.documentElement.hasAttribute(REVEALED_ATTR)) return
    if (!document.getElementById(GUARD_ID)) {
      const guard = document.createElement('style')
      guard.id = GUARD_ID
      guard.textContent = veilCss()
      document.documentElement.appendChild(guard)
    }
    failsafe = window.setTimeout(revealPage, REVEAL_FAILSAFE_MS)
  })
}

/** Removes by id. The element may belong to the loader rather than to this
 * bundle, so a captured reference would leave that one in place. */
export function revealPage(): void {
  window.clearTimeout(failsafe)
  document.getElementById(GUARD_ID)?.remove()
  document.documentElement?.setAttribute(REVEALED_ATTR, '')
}

hidePage()

// Hides the page until our shell paints, so MAM's layout never flashes. Keep it
// the first module in the bundle: anything evaluated earlier delays the veil.
import { PAGE_BG, isDark } from '@/lib/theme'

const GUARD_ID = 'mam-remaster-guard'

// If our boot never reaches revealPage (a throw in MAM markup we misread), the
// page comes back on its own rather than staying blank.
const REVEAL_FAILSAFE_MS = 4000

let guard: HTMLStyleElement | null = null
let failsafe = 0

/** At document-start <html> may not exist yet, so install as soon as it does. */
function whenDocumentElement(fn: () => void) {
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
    bg = isDark() ? PAGE_BG.dark : PAGE_BG.light
  } catch {
    // Storage or matchMedia blocked: light is the safer default.
  }
  return `html{visibility:hidden!important;background:${bg}!important}`
}

export function hidePage(): void {
  whenDocumentElement(() => {
    guard = document.createElement('style')
    guard.id = GUARD_ID
    guard.textContent = veilCss()
    document.documentElement.appendChild(guard)
    failsafe = window.setTimeout(revealPage, REVEAL_FAILSAFE_MS)
  })
}

export function revealPage(): void {
  window.clearTimeout(failsafe)
  guard?.remove()
  guard = null
}

hidePage()

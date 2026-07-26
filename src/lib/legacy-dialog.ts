/** Every MAM overlay (alertBox, confirm2, image uploader, session management)
 * runs through `boxMultiButtons`, so taking that over replaces the whole
 * jQuery-UI layer at once. The body stays MAM's own light-DOM `#dialog-message`
 * node, slotted in: their jQuery binds handlers to it by id afterwards. */

export const DIALOG_SLOT = 'mam-dialog'

export interface LegacyDialogAction {
  label: string
  /** null = plain close, no callback (jQuery-UI's `{Cancel: null}`). */
  run: (() => void) | null
}

export interface LegacyDialog {
  title: string
  actions: LegacyDialogAction[]
}

type LegacyCallback = { function?: (value?: unknown) => void; value?: unknown } | null

interface LegacyWindow {
  boxMultiButtons?: (
    title: string,
    text: string,
    buttons: Record<string, LegacyCallback>,
    minWidth?: number,
    width?: number,
    maxWidth?: number
  ) => void
  dialogbox?: boolean
}

/** Simple messages become a toast; anything interactive gets the full dialog. */
export interface ToastRequest {
  tone: 'success' | 'error' | 'info'
  text: string
}

let current: LegacyDialog | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function subscribeLegacyDialog(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function getLegacyDialog() {
  return current
}

function bodyNode() {
  return document.getElementById('dialog-message')
}

/** Closes the dialog and parks MAM's node back where it came from. */
export function closeLegacyDialog(action?: LegacyDialogAction) {
  const el = bodyNode()
  if (el) {
    el.removeAttribute('slot')
    el.style.display = 'none'
    el.innerHTML = ''
    document.body.appendChild(el)
  }
  ;(window as LegacyWindow).dialogbox = false
  current = null
  emit()
  // Run after closing: callbacks often trigger a fresh dialog of their own.
  action?.run?.()
}

/** Chrome-only content (plain sentence, no controls) reads better as a toast. */
function isSimpleMessage(el: HTMLElement, actions: LegacyDialogAction[]) {
  if (actions.length !== 1 || actions[0].run !== null) return false
  if (el.querySelector('input, select, textarea, button, form, table, pre, img, a, ul, ol')) return false
  return (el.textContent ?? '').trim().length <= 220
}

export function installLegacyDialogBridge(host: HTMLElement, toast: (t: ToastRequest) => void) {
  const w = window as LegacyWindow

  w.boxMultiButtons = (title, text, buttons) => {
    const el = bodyNode()
    if (!el) return
    // Same markup MAM would have injected itself, into MAM's own node: not our
    // trust boundary to tighten. Their handlers rely on the markup staying intact.
    el.innerHTML = typeof text === 'string' ? text : String(text ?? '')

    const actions: LegacyDialogAction[] = Object.entries(buttons ?? {}).map(([label, cb]) => ({
      label,
      run: cb && typeof cb.function === 'function' ? () => cb.function?.(cb.value) : null,
    }))
    const heading = String(title ?? '')

    if (isSimpleMessage(el, actions)) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      el.innerHTML = ''
      toast({
        tone: /error|fail|denied/i.test(heading) ? 'error' : /success/i.test(heading) ? 'success' : 'info',
        text: text || heading,
      })
      return
    }

    el.style.display = ''
    el.slot = DIALOG_SLOT
    if (el.parentElement !== host) host.appendChild(el)
    w.dialogbox = true
    current = { title: heading, actions: actions.length ? actions : [{ label: 'Close', run: null }] }
    emit()
  }
}

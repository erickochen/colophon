// MAM's optional TinyMCE hijacks body textareas (display:none plus a rich
// iframe), which hides our mirrored fields because FormMirror skips hidden
// controls. Keep it from taking the textarea and clean up any that slipped in.
interface TinyMce {
  get?: () => unknown[]
  remove: (selector?: string) => void
}

type Win = Window & { tinymce?: TinyMce; tinyMCE?: TinyMce }

const GLOBALS = ['tinymce', 'tinyMCE'] as const

/** TinyMCE's init resolves to the editors it built; hand back an empty list so
 * MAM's call chain stays happy while no editor is ever created. */
const noInit = () => Promise.resolve([])

function neutralize(mce: TinyMce): void {
  try {
    // An accessor, not a plain value: TinyMCE assigns init while loading and a
    // setter swallows that where a read-only property would throw in strict mode.
    Object.defineProperty(mce, 'init', { configurable: true, get: () => noInit, set: () => {} })
  } catch {
    /* frozen object - detachWysiwyg still cleans up after the fact */
  }
}

/** Runs at document-start, since TinyMCE claims the textarea within ~30ms of
 * DOMContentLoaded. The target is explicit: a manager sandbox hands the loader a
 * window MAM never writes to. */
export function preventWysiwyg(target: Window = window): void {
  for (const key of GLOBALS) {
    let held = (target as Win)[key]
    if (held) neutralize(held)
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        get: () => held,
        set: (v: TinyMce) => {
          held = v
          if (v) neutralize(v)
        },
      })
    } catch {
      /* non-configurable - detachWysiwyg is the fallback */
    }
  }
}

/** What each form held the last time it was handed over, so a submit that never
 * happened cannot restore stale text on the next one. */
const handedOver = new WeakMap<HTMLFormElement, Map<HTMLTextAreaElement, string>>()

/** Hands a form back to us right before it goes out. MAM's editor mirrors its
 * own content into the textarea it took over, so a message written in our
 * composer would post empty. */
export function releaseFields(form: HTMLFormElement): void {
  // form.elements, not a descendant query: MAM's legacy forms sit in a table
  // cell with their rows outside the form node.
  const kept = new Map<HTMLTextAreaElement, string>()
  for (const el of form.elements) if (el instanceof HTMLTextAreaElement) kept.set(el, el.value)
  // Nothing an editor could have claimed, so leave the rest of the page alone.
  if (kept.size === 0) return

  const restore = () => {
    for (const [el, value] of handedOver.get(form) ?? []) if (el.value !== value) el.value = value
  }
  handedOver.set(form, kept)
  detachWysiwyg()
  restore()
  // Removing the editor needs MAM's own global, which a sandbox cannot reach.
  // Its submit handler was bound first so it runs before this one, while the
  // browser reads the fields only once every handler is done.
  form.addEventListener(
    'submit',
    () => {
      restore()
      handedOver.delete(form)
    },
    { once: true }
  )
}

/** Undo an editor that mounted anyway (prevention is best-effort). Removing one
 * syncs its content back and restores the textarea, so nothing is lost. */
export function detachWysiwyg(): void {
  const w = window as Win
  const mce = w.tinymce ?? w.tinyMCE
  try {
    mce?.remove()
  } catch {
    /* editor already gone */
  }
  // Whatever remove() could not reach: drop the chrome and unhide the field or
  // FormMirror skips it as a hidden control and the form renders empty.
  document.querySelectorAll('.tox-tinymce, .mce-tinymce').forEach((el) => el.remove())
  for (const ta of document.querySelectorAll<HTMLTextAreaElement>('textarea[aria-hidden="true"]')) {
    if (ta.style.display !== 'none') continue
    ta.style.removeProperty('display')
    ta.removeAttribute('aria-hidden')
  }
}

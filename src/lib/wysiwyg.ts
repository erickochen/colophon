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

/** Runs at document-start so whatever MAM assigns to window.tinymce comes back
 * with init disabled. TinyMCE claims the textarea within ~30ms of
 * DOMContentLoaded, so the trap has to be in place before mount. The global
 * itself stays, since wysiwygEnabled() reads it. */
export function preventWysiwyg(): void {
  for (const key of GLOBALS) {
    let held = (window as Win)[key]
    if (held) neutralize(held)
    try {
      Object.defineProperty(window, key, {
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

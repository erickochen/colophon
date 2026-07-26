import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import css from './index.css?inline'
import { App } from '@/app/App'
import { setPortalContainer } from '@/lib/portals'
import { capturePage } from '@/lib/extract/shell'
import { cacheWysiwygPref } from '@/components/bb-composer'
import { preventWysiwyg } from '@/lib/wysiwyg'

const HOST_ID = 'mam-remaster-host'

// Before MAM's scripts load: stop TinyMCE from claiming body textareas. It fires
// right around our mount and a hijacked textarea is invisible to FormMirror.
preventWysiwyg()

const DIALOG_BODY_CSS = `
#dialog-message{display:none}
#dialog-message[slot]{display:block!important;font:400 13.5px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#3a352f;background:none!important;border:0!important;padding:0!important;margin:0!important}
html.mam-dark #dialog-message[slot]{color:#e9e6e1}
#dialog-message[slot] *{font-family:inherit!important;background:none!important;border-color:transparent!important;box-shadow:none!important;max-width:100%}
#dialog-message[slot] h1,#dialog-message[slot] h2,#dialog-message[slot] h3{font-size:14px;font-weight:600;margin:.6em 0 .3em}
#dialog-message[slot] a{color:#7a4a2f;text-decoration:underline}
html.mam-dark #dialog-message[slot] a{color:#d9a273}
#dialog-message[slot] pre{white-space:pre-wrap;word-break:break-word;font:400 11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(120,110,100,.12)!important;padding:8px;border-radius:8px}
#dialog-message[slot] table{width:100%;border-collapse:collapse}
#dialog-message[slot] td,#dialog-message[slot] th{padding:4px 8px 4px 0;text-align:left;vertical-align:top}
#dialog-message[slot] input[type=text],#dialog-message[slot] input[type=number],#dialog-message[slot] input[type=password],#dialog-message[slot] select,#dialog-message[slot] textarea{
  font:inherit;color:inherit;background:rgba(120,110,100,.12)!important;border-radius:8px;padding:6px 10px;margin:2px 0;min-height:32px}
#dialog-message[slot] input[type=button],#dialog-message[slot] input[type=submit],#dialog-message[slot] button{
  font:500 13px/1 inherit;color:#faf7f2;background:#2b2622!important;border-radius:8px;padding:9px 14px;cursor:pointer;margin:2px 0}
html.mam-dark #dialog-message[slot] input[type=button],html.mam-dark #dialog-message[slot] input[type=submit],html.mam-dark #dialog-message[slot] button{color:#221f1c;background:#e7e3dd!important}
#dialog-message[slot] input[type=file]{font:inherit;color:inherit;display:block;margin:6px 0}
#dialog-message[slot] input[type=file]::file-selector-button{font:500 12.5px/1 inherit;color:inherit;background:rgba(120,110,100,.14)!important;border:0;border-radius:8px;padding:8px 12px;margin-right:10px;cursor:pointer}
#dialog-message[slot] label{display:inline-flex;align-items:center;gap:6px}
`.trim()

// Failsafe guard: hide the page until we paint, so the legacy layout never
// flashes. At document-start <html> may not exist yet, so install defensively.
let guard: HTMLStyleElement | null = null
let failsafe = 0

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

whenDocumentElement(() => {
  guard = document.createElement('style')
  guard.id = 'mam-remaster-guard'
  guard.textContent = 'html{visibility:hidden!important}'
  document.documentElement.appendChild(guard)
  failsafe = window.setTimeout(unhide, 4000)
})

function unhide() {
  window.clearTimeout(failsafe)
  guard?.remove()
}

function abort() {
  unhide()
  document.getElementById(HOST_ID)?.remove()
  document.getElementById('mam-remaster-hide')?.remove()
}

function onReady(fn: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true })
  } else {
    fn()
  }
}

const BOOT_T0 = performance.now()
const MENU_SELECTOR = '#mainmenu #menu'

/* The menu is the logged-in gate, but it can arrive after DOMContentLoaded,
 * so observe until it lands instead of checking once. */
function whenMenu(fn: (found: boolean) => void) {
  if (document.querySelector(MENU_SELECTOR)) return fn(true)
  let settled = false
  const done = (found: boolean) => {
    if (settled) return
    settled = true
    obs.disconnect()
    window.clearTimeout(timer)
    fn(found)
  }
  const obs = new MutationObserver(() => {
    if (document.querySelector(MENU_SELECTOR)) done(true)
  })
  obs.observe(document.documentElement, { childList: true, subtree: true })
  const timer = window.setTimeout(() => done(document.querySelector(MENU_SELECTOR) !== null), 10_000)
}

function start() {
  onReady(() => {
    whenMenu((found) => {
      console.info('[colophon boot]', {
        readyState: document.readyState,
        menuAfterMs: Math.round(performance.now() - BOOT_T0),
        found,
      })
      if (!found || window.top !== window.self) {
        abort()
        return
      }
      boot()
    })
  })
}

if ((document as Document & { prerendering?: boolean }).prerendering) {
  document.addEventListener('prerenderingchange', start, { once: true })
} else {
  start()
}

// bfcache restores keep the DOM but our host may be gone after an abort.
window.addEventListener('pageshow', (e) => {
  if (e.persisted && !document.getElementById(HOST_ID)) start()
})

function boot() {
  try {
    const page = capturePage(document)
    // Remember MAM's "Disable WYSIWYG" choice while we are on the page that has it.
    cacheWysiwygPref(document)

    // Hide the legacy page (also nodes MAM scripts append later), keep our host visible.
    // Also normalize the document: MAM's CSS sets html font-size 12px (rem
    // leaks into shadow DOM) and adds margins/padding around body.
    const hide = document.createElement('style')
    hide.id = 'mam-remaster-hide'
    hide.textContent = [
      // jQuery-UI dialogs (session manager, cookie viewer) must stay visible:
      // MAM's JS appends them to <body> and our proxied buttons open them.
      `body > :not(#${HOST_ID}):not(.ui-dialog):not(.ui-widget-overlay){display:none!important}`,
      // MAM's CSS sets scrollbar-gutter:stable both-edges on <html>, which reserves
      // an 11px strip on both sides, the empty strip left of our sidebar. Reset it.
      'html{font-size:16px!important;margin:0!important;padding:0!important;border:0!important;width:auto!important;min-width:0!important;max-width:none!important;background:none!important;scrollbar-gutter:auto!important;height:auto!important;min-height:0!important}',
      // MAM sizes <body> to its own full-page layout of about 1750px and that
      // persists once their content is hidden. Pin body to the viewport instead;
      // #mam-root carries the real fill.
      'body{margin:0!important;padding:0!important;border:0!important;width:auto!important;min-width:0!important;max-width:none!important;background:none!important;height:auto!important;min-height:100vh!important}',
      // MAM's #dialog-message is slotted into our dialog and therefore stays in
      // the light DOM, out of reach of the shadow stylesheet. Neutralise MAM's
      // own styling on it so it reads as part of our sheet.
      DIALOG_BODY_CSS,
    ].join('\n')
    document.head.appendChild(hide)

    const host = document.createElement('div')
    host.id = HOST_ID
    document.body.appendChild(host)

    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = css
    shadow.appendChild(style)

    // Dependency CSS (sonner etc.) is collected by the patched __insertCSS into
    // a global buffer instead of document.head, so pour it into the shadow root
    // so it reaches components that render here. Live-append future pushes too.
    const collected: string[] = (globalThis as { __mamCollectedCSS?: string[] }).__mamCollectedCSS ?? []
    const addDepCss = (code: string) => {
      const st = document.createElement('style')
      st.textContent = code
      shadow.appendChild(st)
    }
    collected.forEach(addDepCss)
    ;(globalThis as { __mamCollectedCSS?: unknown }).__mamCollectedCSS = { push: addDepCss, forEach: () => {}, length: collected.length }

    const rootEl = document.createElement('div')
    rootEl.id = 'mam-root'
    shadow.appendChild(rootEl)
    setPortalContainer(rootEl)

    applyTheme(rootEl)
    watchSystemTheme(rootEl)

    createRoot(rootEl).render(
      <StrictMode>
        <App page={page} host={host} />
      </StrictMode>
    )

    // Reveal on the next frame, after React has painted the shell.
    requestAnimationFrame(() => requestAnimationFrame(unhide))
  } catch (err) {
    console.error('[MAM Remaster] boot failed, restoring original page', err)
    abort()
  }
}

export type Theme = 'light' | 'dark' | 'auto'

const THEME_KEY = 'mam-remaster:theme'
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Stored preference. Anything unrecognised counts as auto. */
export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'auto'
}

/** Which of the two schemes a preference resolves to right now. */
export function isDark(theme: Theme = getTheme()): boolean {
  return theme === 'dark' || (theme === 'auto' && systemDark().matches)
}

export function applyTheme(rootEl: HTMLElement, theme?: Theme) {
  if (theme) localStorage.setItem(THEME_KEY, theme)
  const dark = isDark(theme ?? getTheme())
  rootEl.classList.toggle('dark', dark)
  // Light-DOM marker: the slotted legacy dialog body cannot see the shadow class.
  document.documentElement.classList.toggle('mam-dark', dark)
}

/** On auto, a system switch repaints straight away instead of at the next load. */
export function watchSystemTheme(rootEl: HTMLElement): void {
  systemDark().addEventListener('change', () => {
    if (getTheme() === 'auto') applyTheme(rootEl)
  })
}

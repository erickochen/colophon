// Must stay the first import: it veils the page. Every module evaluated before
// it is time MAM's layout can paint in.
import { revealPage } from '@/lib/boot-guard'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import css from './index.css?inline'
import { App } from '@/app/App'
import { setPortalContainer } from '@/lib/portals'
import { capturePage } from '@/lib/extract/shell'
import { cacheWysiwygPref } from '@/components/bb-composer'
import { preventWysiwyg } from '@/lib/wysiwyg'
import { preventLegacyAutoSearch } from '@/lib/quiet-search'
import { applyTheme, watchSystemTheme } from '@/lib/theme'
import { applyMobileViewport, removeMobileViewport } from '@/lib/viewport'
import { migrateLegacyKeys } from '@/lib/settings'
import { registerSheetProps, registerShadowProps } from '@/lib/tw-props'

const HOST_ID = 'colophon-host'

// Marks MAM's own body children. Anything appended later (other userscripts
// such as GiftMAM) is left alone so its UI stays visible next to ours.
const LEGACY_ATTR = 'data-mam-legacy'

// Before MAM's scripts load: stop TinyMCE from claiming body textareas. It fires
// right around our mount and a hijacked textarea is invisible to FormMirror.
preventWysiwyg()

// Same moment: keep torSearch.js from running its own search under the veil.
preventLegacyAutoSearch()

// Old storage prefixes rename to colophon: before anything reads them.
migrateLegacyKeys()

/* MAM's dialog body stays a light-DOM node, so these rules live in document.head
 * while the colors come from the shadow tree: a slotted element inherits custom
 * properties from the slot's parent, so the tokens follow the active scheme. */
const DIALOG_BODY_CSS = `
#dialog-message{display:none}
/* A manager that runs us in its own sandbox cannot replace MAM's dialog layer,
   so their jQuery-UI box opens instead of ours. Hand its body back there. */
.ui-dialog #dialog-message{display:block!important}
#dialog-message[slot]{display:block!important;font:400 13.5px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--foreground);background:none!important;border:0!important;padding:0!important;margin:0!important}
#dialog-message[slot] *{font-family:inherit!important;background:none!important;border-color:transparent!important;box-shadow:none!important;max-width:100%}
#dialog-message[slot] h1,#dialog-message[slot] h2,#dialog-message[slot] h3{font-size:14px;font-weight:600;margin:.6em 0 .3em}
#dialog-message[slot] a{color:var(--brand);text-decoration:underline}
#dialog-message[slot] pre{white-space:pre-wrap;word-break:break-word;font:400 11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--muted)!important;padding:8px;border-radius:8px}
#dialog-message[slot] table{width:100%;border-collapse:collapse}
#dialog-message[slot] td,#dialog-message[slot] th{padding:4px 8px 4px 0;text-align:left;vertical-align:top}
#dialog-message[slot] input[type=text],#dialog-message[slot] input[type=number],#dialog-message[slot] input[type=password],#dialog-message[slot] select,#dialog-message[slot] textarea{
  font:inherit;color:inherit;background:var(--muted)!important;border-radius:8px;padding:6px 10px;margin:2px 0;min-height:32px}
#dialog-message[slot] input[type=button],#dialog-message[slot] input[type=submit],#dialog-message[slot] button{
  font:500 13px/1 inherit;color:var(--primary-foreground);background:var(--primary)!important;border-radius:8px;padding:9px 14px;cursor:pointer;margin:2px 0}
#dialog-message[slot] input[type=file]{font:inherit;color:inherit;display:block;margin:6px 0}
#dialog-message[slot] input[type=file]::file-selector-button{font:500 12.5px/1 inherit;color:inherit;background:var(--muted)!important;border:0;border-radius:8px;padding:8px 12px;margin-right:10px;cursor:pointer}
#dialog-message[slot] label{display:inline-flex;align-items:center;gap:6px}

/* MAM writes the two-factor QR code and its verify button into #addTOTParea and
 * binds handlers by id, so the node is slotted into our card as it is. */
#addTOTParea[slot]{display:block;font:400 13px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--foreground)}
#addTOTParea[slot] img{height:200px;width:auto;border-radius:10px;background:#fff;padding:8px;margin:2px 0 8px}
#addTOTParea[slot] input{font:inherit;color:inherit;background:var(--muted);border:1px solid var(--border);border-radius:8px;padding:6px 10px;min-height:32px;margin:6px 8px 6px 0}
#addTOTParea[slot] button{font:500 13px/1 inherit;color:var(--primary-foreground);background:var(--primary);border:0;border-radius:8px;padding:9px 14px;cursor:pointer;margin:2px 0}
`.trim()

function abort() {
  revealPage()
  removeMobileViewport()
  document.getElementById(HOST_ID)?.remove()
  document.getElementById('colophon-hide')?.remove()
  document.documentElement.style.removeProperty('background-color')
  document.querySelectorAll(`[${LEGACY_ATTR}]`).forEach((el) => el.removeAttribute(LEGACY_ATTR))
}

function onReady(fn: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true })
  } else {
    // Late evaluation (bfcache re-entry, manual eval): let the module finish
    // evaluating first or boot() hits declarations below it mid-initialisation.
    queueMicrotask(fn)
  }
}

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
    applyMobileViewport()
    const page = capturePage(document)
    // Remember MAM's "Disable WYSIWYG" choice while we are on the page that has it.
    cacheWysiwygPref(document)

    // Tag MAM's own body children, then hide those. The page keeps rendering
    // for MAM's scripts; anything a second userscript adds later stays visible.
    for (const el of [...document.body.children]) {
      if (el.id !== HOST_ID) el.setAttribute(LEGACY_ATTR, '')
    }

    // Hide the legacy page, keep our host visible. Also normalize the document:
    // MAM's CSS sets html font-size 12px (rem leaks into shadow DOM) and adds
    // margins/padding around body.
    const hide = document.createElement('style')
    hide.id = 'colophon-hide'
    hide.textContent = [
      // jQuery-UI dialogs (session manager, cookie viewer) must stay visible:
      // MAM's JS appends them to <body> and our proxied buttons open them.
      `body > [${LEGACY_ATTR}]:not(.ui-dialog):not(.ui-widget-overlay){display:none!important}`,
      // Scaffolding jQuery-UI and TinyMCE append to <body> on demand. It arrives
      // too late to be tagged above. None of it belongs to a page we render.
      'body > ul.ui-autocomplete,body > .ui-helper-hidden-accessible,body > #ui-datepicker-div,body > .ui-tooltip,body > .tox-silver-sink{display:none!important}',
      // MAM's CSS sets scrollbar-gutter:stable both-edges on <html>, which reserves
      // an 11px strip on both sides, the empty strip left of our sidebar. Reset it.
      'html{font-size:16px!important;margin:0!important;padding:0!important;border:0!important;width:auto!important;min-width:0!important;max-width:none!important;background:none!important;scrollbar-gutter:auto!important;height:auto!important;min-height:0!important}',
      // MAM sizes <body> to its own full-page layout of about 1750px and that
      // persists once their content is hidden. Pin body to the viewport instead;
      // #mam-root carries the real fill. Height stays free so an open popup can
      // size <body> to the viewport, which is what keeps the topbar stuck.
      'body{margin:0!important;padding:0!important;border:0!important;width:auto!important;min-width:0!important;max-width:none!important;background:none!important;min-height:100vh!important}',
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
      // A late sheet brings its own @property rules, which need the same pass.
      registerSheetProps(st.sheet)
    }
    collected.forEach(addDepCss)
    ;(globalThis as { __mamCollectedCSS?: unknown }).__mamCollectedCSS = { push: addDepCss, forEach: () => {}, length: collected.length }

    registerShadowProps(shadow)

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
    requestAnimationFrame(() => requestAnimationFrame(revealPage))
  } catch (err) {
    console.error('[Colophon] boot failed, restoring original page', err)
    abort()
  }
}

// Last statement in the bundle. The loader reads it to tell a payload that
// evaluated from one the page refused to run. It also names the running version.
;(globalThis as { __colophon?: string }).__colophon = __COLOPHON_VERSION__

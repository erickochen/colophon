// Bridge to the quiCKIE userscript (github.com/WirlyWirly/quiCKIE) when it runs
// alongside Colophon. Every quiCKIE-specific selector lives in this file.
import { useSyncExternalStore } from 'react'
import { getPortalContainer } from '@/lib/portals'

// quiCKIE sweeps the document for this attribute, puts a BunnyButton beside
// every element carrying it and takes the attribute off again. Its wiki page
// "Integrating Other UserScripts" describes the contract.
const HOOK_ATTR = 'data-quickie_torrenturl'
// What goes between our element and its button. Left unset, quiCKIE reads the
// spacing off the sibling of the first button and writes the string "undefined"
// where there is none.
const SEPARATOR_ATTR = 'data-quickie_separator'
const BUTTON_SELECTOR = 'a.quickie_bunnyButton'
// Its own stylesheet, which lands in the document head the moment it loads.
const LOADED_MARK = 'quickie_bunnyButton'

// quiCKIE builds no third-party button while the page carries none of its own,
// and copies the first one it finds onto ours. This empty anchor stands in as
// that first one. No click handler, so its "click every button" skips it.
const BASE_ID = 'colophon-quickie-base'
// This becomes the entire inline style of every button we are handed, since
// quiCKIE overwrites theirs with the one it reads here.
const BASE_STYLE = 'font-size:15px;line-height:1;text-decoration:none;color:inherit'

// The wrapper is what quiCKIE inserts into, so it holds the button plus its
// spacing and nothing else. Zero font size swallows that spacing; the button
// brings its own size along from the anchor above.
const WRAP_STYLE = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:0'

// Remembers that quiCKIE's handshake column is on for MyAnonaMouse, so a list
// can hold the space open before the first sweep lands. It ships off.
const ACTIVE_KEY = 'colophon:quickie'

// A sweep waits a delay the reader sets (two seconds out of the box) and
// repeats every five after that. Nothing filled by this point reads as the
// column being off, so the space goes away again. A later sweep that does fill
// puts it straight back.
const SWEEP_GRACE_MS = 20_000

type Listener = () => void

let active = read()
let ready = false
const listeners = new Set<Listener>()

function read(): boolean {
  try {
    return localStorage.getItem(ACTIVE_KEY) === '1'
  } catch {
    return false
  }
}

function write(on: boolean) {
  try {
    if (on) localStorage.setItem(ACTIVE_KEY, '1')
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // private mode
  }
}

function announce() {
  listeners.forEach((fn) => fn())
}

function setActive(on: boolean) {
  if (active === on) return
  active = on
  write(on)
  announce()
}

/** The shadow host, the one place a light-DOM element can sit and still render
 * inside our tree through a slot. */
function shadowHost(): HTMLElement | null {
  const root = getPortalContainer().getRootNode()
  return root instanceof ShadowRoot ? (root.host as HTMLElement) : null
}

function loaded(): boolean {
  for (const el of document.head.querySelectorAll('style')) {
    if (el.textContent?.includes(LOADED_MARK)) return true
  }
  return false
}

function addBase() {
  if (document.getElementById(BASE_ID)) return
  const a = document.createElement('a')
  a.id = BASE_ID
  a.className = 'quickie_bunnyButton'
  a.setAttribute('style', BASE_STYLE)
  // First in the body, so quiCKIE reads this one rather than any button it
  // built for MAM's own hidden links, which carry the old page's styling.
  document.body.insertBefore(a, document.body.firstChild)
}

/** quiCKIE also builds buttons for MAM's own links, which sit in the half of the
 * page we hide. Unreachable, yet its "click every button" still fires them, so a
 * detail page would send twice and spend two wedges. */
function dropUnreachable() {
  for (const el of document.querySelectorAll<HTMLElement>(`${BUTTON_SELECTOR}:not(.quickie_thirdParty)`)) {
    if (el.id !== BASE_ID && el.offsetParent === null) el.remove()
  }
}

const pending = new Set<() => void>()
let watching = false

/** True once quiCKIE is on the page. Until then nothing is planted, so a reader
 * without it pays for none of this. */
function check(): boolean {
  if (ready) return true
  if (!loaded()) return false
  ready = true
  addBase()
  pending.forEach((fn) => fn())
  pending.clear()
  announce()
  return true
}

/** Watching the head rather than waiting a fixed moment covers either load
 * order between quiCKIE and us. */
function watch() {
  if (watching || ready) return
  watching = true
  const obs = new MutationObserver(() => {
    if (check()) obs.disconnect()
  })
  obs.observe(document.head, { childList: true })
}

let live = 0
let everFilled = false
let grace: number | null = null

function armGrace() {
  if (!active || everFilled || grace != null) return
  grace = window.setTimeout(() => {
    grace = null
    if (!everFilled) setActive(false)
  }, SWEEP_GRACE_MS)
}

function dropGrace() {
  if (grace == null) return
  window.clearTimeout(grace)
  grace = null
}

function plant(host: HTMLElement, url: string, onFilled: (wrap: HTMLElement) => void): () => void {
  const wrap = document.createElement('span')
  wrap.setAttribute('style', WRAP_STYLE)
  const hook = document.createElement('span')
  hook.setAttribute(HOOK_ATTR, url)
  hook.setAttribute(SEPARATOR_ATTR, ' ')
  hook.style.display = 'none'
  wrap.appendChild(hook)
  host.appendChild(wrap)
  live += 1
  armGrace()

  const filled = () => {
    if (!wrap.querySelector(BUTTON_SELECTOR)) return false
    everFilled = true
    dropGrace()
    setActive(true)
    onFilled(wrap)
    dropUnreachable()
    return true
  }

  let obs: MutationObserver | null = null
  if (!filled()) {
    obs = new MutationObserver(() => {
      if (filled()) obs?.disconnect()
    })
    obs.observe(wrap, { childList: true })
  }

  return () => {
    obs?.disconnect()
    wrap.remove()
    live -= 1
    // A list switching to a view without download buttons takes every hook with
    // it. Left running, the timer would then read the empty page as the column
    // being off.
    if (live === 0) dropGrace()
  }
}

/** Plants one hook for quiCKIE plus reports back once a button lands in it. The
 * return value takes the hook down again. Null means there is no shadow host. */
export function plantHook(url: string, onFilled: (wrap: HTMLElement) => void): (() => void) | null {
  const host = shadowHost()
  if (!host) return null

  let take: (() => void) | null = null
  let gone = false
  const start = () => {
    if (!gone) take = plant(host, url, onFilled)
  }

  if (check()) start()
  else {
    pending.add(start)
    watch()
  }

  return () => {
    gone = true
    pending.delete(start)
    take?.()
  }
}

const subscribe = (fn: Listener) => {
  listeners.add(fn)
  watch()
  check()
  return () => listeners.delete(fn)
}
const snapshot = () => ready && active

/** True once quiCKIE is on the page and has actually put a button in one of our
 * slots on this browser. Its handshake column ships off, so this stays false
 * for most. */
export function useQuickie(): boolean {
  return useSyncExternalStore(subscribe, snapshot)
}

// Bridge to the GiftMAM userscript (github.com/Photaz/GiftMAM) when it runs
// alongside Colophon. Every GiftMAM-specific selector lives in this file.
import { useSyncExternalStore } from 'react'
import { DEFAULT_GIFT, MAX_GIFT, MIN_GIFT } from '@/lib/mam-api'

// GiftMAM's floating widget, appended to <body> on document-idle.
const PANEL_SELECTOR = '#mam-gift-panel'
// GiftMAM marks members from its gifted database with this class on legacy links.
const GIFTED_LINK_SELECTOR = 'a.mam-gifted-user[href*="/u/"]'
// The widget's "Default Gift Amount" setting: "Max" or a number.
const AMOUNT_INPUT_SELECTOR = '#mam-cfg-amount'
// Its two gifting switches. Colophon renders both surfaces, so its buttons
// follow these.
const SURFACE_TOGGLE = { shoutbox: '#mam-cfg-shoutbox', forum: '#mam-cfg-forum' } as const
// Its own bonus readout, which only its own actions keep current.
const PANEL_BP_SELECTOR = '#mam-ui-bp'
const PANEL_BP_WRAP_SELECTOR = '#mam-ui-bp-wrap'

export type GiftSurface = keyof typeof SURFACE_TOGGLE

type Listener = () => void

let present = false
const presentListeners = new Set<Listener>()
let presentObserver: MutationObserver | null = null

let gifted = new Set<string>()
const giftedListeners = new Set<Listener>()
let giftedObserver: MutationObserver | null = null

/** Uid out of a /u/<uid> style href. */
export function uidFromHref(href: string | null): string | null {
  return href?.split('/u/')[1]?.match(/^\d+/)?.[0] ?? null
}

function checkPresent() {
  if (present || !document.querySelector(PANEL_SELECTOR)) return
  present = true
  presentObserver?.disconnect()
  presentObserver = null
  if (giftedListeners.size) watchGifted()
  // The widget fills its controls from stored settings in the same task that
  // appends the panel. A stored value fires no change event.
  onToggleChange()
  presentListeners.forEach((fn) => fn())
}

function watchPresent() {
  checkPresent()
  if (present || presentObserver) return
  presentObserver = new MutationObserver(checkPresent)
  presentObserver.observe(document.body, { childList: true })
}

function readGifted(root: ParentNode): Set<string> {
  const next = new Set<string>()
  for (const a of root.querySelectorAll<HTMLAnchorElement>(GIFTED_LINK_SELECTOR)) {
    const uid = uidFromHref(a.getAttribute('href'))
    if (uid) next.add(uid)
  }
  return next
}

function refreshGifted(root: ParentNode) {
  const next = readGifted(root)
  if (next.size === gifted.size && [...next].every((uid) => gifted.has(uid))) return
  gifted = next
  giftedListeners.forEach((fn) => fn())
}

function watchGifted() {
  if (giftedObserver || !present) return
  // GiftMAM marks inside the legacy #mainBody, also mid-run and after its
  // refresh replaced a container's innerHTML.
  const root = document.getElementById('mainBody') ?? document.body
  giftedObserver = new MutationObserver(() => refreshGifted(root))
  giftedObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  refreshGifted(root)
}

// Stable references: a shout list renders these per row, so a new closure per
// render would resubscribe hundreds of times per refresh.
const subscribePresent = (fn: Listener) => {
  presentListeners.add(fn)
  watchPresent()
  return () => presentListeners.delete(fn)
}
const getPresent = () => present

const subscribeGifted = (fn: Listener) => {
  giftedListeners.add(fn)
  if (present) watchGifted()
  else watchPresent()
  return () => giftedListeners.delete(fn)
}
const getGifted = () => gifted

/** True once GiftMAM's widget is on the page. */
export function useGiftMam(): boolean {
  return useSyncExternalStore(subscribePresent, getPresent)
}

/** Uids GiftMAM marked as already gifted. Stays empty without the widget. */
export function useGiftedSet(): Set<string> {
  return useSyncExternalStore(subscribeGifted, getGifted)
}

let toggleObserved = false
const toggleListeners = new Set<Listener>()
// Reading the checkbox each render keeps this in step with the widget without a
// cached copy to invalidate.
const toggleSnapshot = () => `${readToggle('shoutbox')}|${readToggle('forum')}`
let toggles = toggleSnapshot()

function readToggle(surface: GiftSurface): boolean {
  const box = document.querySelector<HTMLInputElement>(SURFACE_TOGGLE[surface])
  // Missing widget or an older version without the switch: GiftMAM defaults to on.
  return box ? box.checked : true
}

function onToggleChange() {
  const next = toggleSnapshot()
  if (next === toggles) return
  toggles = next
  toggleListeners.forEach((fn) => fn())
}

function watchToggles() {
  if (toggleObserved) return
  toggleObserved = true
  // The widget announces every setting it writes. The capture listener is the
  // fallback for managers that keep custom events inside their sandbox.
  window.addEventListener('mam-config-updated', onToggleChange)
  document.addEventListener('change', onToggleChange, true)
}

const subscribeToggles = (fn: Listener) => {
  toggleListeners.add(fn)
  watchToggles()
  return () => toggleListeners.delete(fn)
}
const getToggles = () => toggles

/** Whether GiftMAM's switch for this surface is on. */
export function useGiftingEnabled(surface: GiftSurface): boolean {
  const [shoutbox, forum] = useSyncExternalStore(subscribeToggles, getToggles).split('|')
  return (surface === 'shoutbox' ? shoutbox : forum) === 'true'
}

/** Keep the widget's own bonus readout in step after we spend, the way its
 * StateManager writes it. */
export function syncPanelBalance(balance: number): void {
  const el = document.querySelector<HTMLElement>(PANEL_BP_SELECTOR)
  const wrap = document.querySelector<HTMLElement>(PANEL_BP_WRAP_SELECTOR)
  if (!el) return
  const whole = Math.floor(balance)
  el.textContent = whole >= 1000 ? `${Math.floor(whole / 1000)}K` : String(whole)
  if (wrap) wrap.title = `Bonus Points: ${whole.toLocaleString('en-US')}`
}

/** The widget's default gift amount; "Max" counts as the server maximum. */
export function readDefaultGiftAmount(): number {
  const raw = document.querySelector<HTMLInputElement>(AMOUNT_INPUT_SELECTOR)?.value.trim() ?? ''
  if (/^max$/i.test(raw)) return MAX_GIFT
  const amount = parseInt(raw, 10)
  if (Number.isNaN(amount)) return DEFAULT_GIFT
  return Math.min(MAX_GIFT, Math.max(MIN_GIFT, amount))
}

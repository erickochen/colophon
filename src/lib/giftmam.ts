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

/** The widget's default gift amount; "Max" counts as the server maximum. */
export function readDefaultGiftAmount(): number {
  const raw = document.querySelector<HTMLInputElement>(AMOUNT_INPUT_SELECTOR)?.value.trim() ?? ''
  if (/^max$/i.test(raw)) return MAX_GIFT
  const amount = parseInt(raw, 10)
  if (Number.isNaN(amount)) return DEFAULT_GIFT
  return Math.min(MAX_GIFT, Math.max(MIN_GIFT, amount))
}

// MAM keeps its live counters in header nodes that its own scripts rewrite after
// a purchase. Reading from there keeps our chips current whoever spent the points.
import { useSyncExternalStore } from 'react'
import type { BonusBuyResult } from '@/lib/mam-api'
import { counterValue } from '@/lib/counters'

// Bonus sits in two places and the writers disagree: site.js updates the user
// menu entry while GiftMAM and we update the header strip. Both are watched, so
// whichever one changes wins.
const BONUS_STRIP_ID = 'tmBP'
const BONUS_MENU_ID = 'bonusLink'
// Wedges live in the store page node when it exists, otherwise in a user-menu
// entry that carries no id, so that one is found by its label.
const WEDGE_STORE_ID = 'cheeseWedges'
const WEDGE_LABEL = /^FL Wedges:/

type Listener = () => void

interface Store {
  value: string | null
  seen: Map<HTMLElement, string | null>
  listeners: Set<Listener>
  observer: MutationObserver | null
  nodes: () => HTMLElement[]
  readNode: (el: HTMLElement) => string | null
}

/** The user-menu entry whose label matches, for the counters MAM leaves unnamed. */
function menuEntry(label: RegExp): HTMLElement | null {
  for (const a of document.querySelectorAll<HTMLElement>('li.mmUserStats ul li a')) {
    if (label.test(a.textContent?.replace(/\s+/g, ' ').trim() ?? '')) return a
  }
  return null
}

/** "FL Wedges: 3" to "3". A node holding anything but a plain count says
 * nothing, so the other node decides instead. */
function numberFrom(raw: string | null | undefined): string | null {
  const n = counterValue(raw)
  return n == null ? null : n.toLocaleString('en-US')
}

function readBonusNode(el: HTMLElement): string | null {
  // The strip carries the unrounded value as an attribute.
  return numberFrom(el.getAttribute('data-exact-b-p') ?? el.textContent)
}

const present = (el: HTMLElement | null): HTMLElement[] => (el ? [el] : [])

const bonusStore: Store = {
  value: null,
  seen: new Map(),
  listeners: new Set(),
  observer: null,
  nodes: () => [BONUS_STRIP_ID, BONUS_MENU_ID].flatMap((id) => present(document.getElementById(id))),
  readNode: readBonusNode,
}

const wedgeStore: Store = {
  value: null,
  seen: new Map(),
  listeners: new Set(),
  observer: null,
  nodes: () => [...present(document.getElementById(WEDGE_STORE_ID)), ...present(menuEntry(WEDGE_LABEL))],
  readNode: (el) => numberFrom(el.textContent),
}

/** Take the value of whichever node changed since the last look. */
function sync(store: Store, nodes: HTMLElement[]) {
  let changed: string | null | undefined
  for (const el of nodes) {
    const value = store.readNode(el)
    if (store.seen.get(el) === value) continue
    store.seen.set(el, value)
    if (value != null) changed = value
  }
  if (changed === undefined || changed === store.value) return
  store.value = changed
  store.listeners.forEach((fn) => fn())
}

function watch(store: Store) {
  if (store.observer) return
  const nodes = store.nodes()
  if (!nodes.length) return
  for (const el of nodes) store.seen.set(el, store.readNode(el))
  // Nodes that read as nothing leave the earlier value standing.
  store.value = nodes.map(store.readNode).find((v) => v != null) ?? store.value
  store.observer = new MutationObserver(() => sync(store, nodes))
  for (const el of nodes) {
    store.observer.observe(el, { childList: true, characterData: true, subtree: true, attributes: true })
  }
}

const subscribeBonus = (fn: Listener) => {
  bonusStore.listeners.add(fn)
  watch(bonusStore)
  return () => bonusStore.listeners.delete(fn)
}
const getBonus = () => bonusStore.value

const subscribeWedges = (fn: Listener) => {
  wedgeStore.listeners.add(fn)
  watch(wedgeStore)
  return () => wedgeStore.listeners.delete(fn)
}
const getWedges = () => wedgeStore.value

/** Bonus balance that follows MAM's header, falling back to what the page was
 * rendered with. */
export function useLiveBonus(initial: string | null): string | null {
  return useSyncExternalStore(subscribeBonus, getBonus) ?? initial
}

/** Wedges in hand, same live source as the bonus balance. */
export function useLiveWedges(initial: number | null): string | null {
  const live = useSyncExternalStore(subscribeWedges, getWedges)
  return live ?? (initial != null ? initial.toLocaleString('en-US') : null)
}

/** Feed a store answer back into MAM's own header updater, then cover the two
 * nodes it skips: the header strip and the unnamed wedge entry. */
export function applyPointsUpdate(result: BonusBuyResult): void {
  const update = (window as unknown as { updatePointsEtc?: (data: BonusBuyResult) => void }).updatePointsEtc
  if (typeof update === 'function') {
    try {
      update(result)
    } catch {
      // A failed jQuery call must not swallow the counters below.
    }
  }
  const balance = Number(result.seedbonus)
  const strip = document.getElementById(BONUS_STRIP_ID)
  if (strip && !Number.isNaN(balance)) {
    strip.textContent = `Bonus: ${Math.floor(balance)}`
    strip.setAttribute('data-exact-b-p', String(Math.floor(balance)))
  }
  const wedgesLeft = Number(result.FLleft)
  const wedgeEl = menuEntry(WEDGE_LABEL)
  if (wedgeEl && !Number.isNaN(wedgesLeft)) {
    wedgeEl.textContent = `FL Wedges: ${Math.floor(wedgesLeft)}`
  }
}

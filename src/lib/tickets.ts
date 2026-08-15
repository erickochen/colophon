// MAM's ticket cascade lives in /tickets/js.php: window.menuOptions holds the
// taxonomy and window.updateForm injects each next level into the page. We read
// the taxonomy for our own picker and drive their function for everything else,
// so the POST, the extra fields plus the URL rewrite stay theirs.

import { humanizeFieldName } from '@/lib/form-mirror'

/** MAM's forum board for bugs that do not belong in a ticket. */
const BUG_FORUM = '/f/b/78'

/** An unsent ticket, parked for the tab's lifetime. Reaching a ticket page
 * means the POST landed, so those pages drop it. */
export const DRAFT_KEY = 'colophon:ticket-draft'

export function clearTicketDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* private mode */
  }
}

export interface TicketTopic {
  /** MAM's own keys joined, never an index: "3|6|1". */
  key: string
  main: string
  l2: string
  l3: string
  cat: string
  sub: string
  leaf: string
  /** Lowercased haystack: the whole path plus MAM's own hint text plus aliases. */
  search: string
  /** This topic asks the reader to use the bug report forum instead. */
  redirect: boolean
  /** This topic injects fields that have to be filled in. */
  fields: boolean
}

interface RawNode {
  name: string
  options?: Record<string, RawNode> | RawNode[]
  extraInfo?: string
  requireInpage?: number
}

type Win = Window & {
  menuOptions?: Record<string, RawNode>
  updateForm?: (level: number) => void
}

/** Words a member reaches for that MAM's own topic names do not carry. Keyed by
 * the name path, since the numeric keys have been renumbered before. */
const ALIASES: Record<string, string> = {
  'Account>Login>IP blocked': 'locked out',
  'Account>Updates>Seedbox': 'whitelist server',
  'Torrents>Downloading>No seeds': 'dead unseeded stalled',
  'Torrents>Downloading>Freeleech Picks': 'fl wedge',
  'Torrents>Hit and Runs>Potential H&R': 'hnr warning',
  'Torrents>Seeding>Passkey': 'announce url',
  'Torrents>Seeding>Statistics': 'ratio upload buffer',
  'Torrents>Rules violation>Duplicate': 'dupe',
  'Technical Support>Torrent Client>Connectability': 'port firewall nat',
  'Other>Donations>Donation issue': 'points wedges vault',
}

/** Options come as an object keyed by MAM's ids. A level holding exactly one
 * child comes as an array instead. Both keep their own key as what we post. */
function entries(node: RawNode | undefined): [string, RawNode][] {
  const o = node?.options
  if (Array.isArray(o)) return o.map((v, i) => [String(i), v])
  if (o && typeof o === 'object') return Object.entries(o)
  return []
}

const plain = (html: string) => {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

/** Every topic in MAM's tree, flattened once. Null when the page never loaded
 * the script that defines it. */
export function readTopics(win: Window = window): TicketTopic[] | null {
  const tree = (win as Win).menuOptions
  if (!tree || typeof tree !== 'object') return null
  const out: TicketTopic[] = []
  for (const [main, cat] of Object.entries(tree)) {
    for (const [l2, sub] of entries(cat)) {
      for (const [l3, leaf] of entries(sub)) {
        const path = `${cat.name}>${sub.name}>${leaf.name}`
        const info = leaf.extraInfo ?? ''
        out.push({
          key: `${main}|${l2}|${l3}`,
          main, l2, l3,
          cat: cat.name,
          sub: sub.name,
          leaf: leaf.name,
          search: `${cat.name} ${sub.name} ${leaf.name} ${plain(info)} ${ALIASES[path] ?? ''}`.toLowerCase(),
          redirect: info.includes(BUG_FORUM),
          fields: /<(input|select|textarea)\b/i.test(info),
        })
      }
    }
  }
  return out.length > 0 ? out : null
}

const sel = (name: string) => document.querySelector<HTMLSelectElement>(`select[name="${name}"]`)

/** The chain the server intended: #options carries "main\l2\l3" on a deep link
 * and stays "0\0\0" otherwise. The query string is the fallback. */
export function readChain(): [string, string, string] | null {
  const raw = document.querySelector<HTMLInputElement>('#options')?.value ?? ''
  const parts = raw.split('\\')
  if (parts.length === 3 && parts.some((p) => p !== '0')) return [parts[0], parts[1], parts[2]]
  const q = new URLSearchParams(location.search)
  const main = q.get('main')
  if (!main || main === '0') return null
  return [main, q.get('l2') ?? '0', q.get('l3') ?? '0']
}

/** Runs MAM's own cascade for a topic and checks its work at every step. False
 * means the page did not react the way this build expects, which is the signal
 * to stand aside rather than render half a form. */
export function applyChain(main: string, l2: string, l3: string): boolean {
  const step = (name: string, value: string, level: number) => {
    const el = sel(name)
    if (!el) return false
    el.value = value
    if (el.value !== value) return false
    try {
      const run = (window as Win).updateForm
      if (typeof run === 'function') run(level)
      else el.dispatchEvent(new Event('change', { bubbles: true }))
    } catch {
      return false
    }
    return true
  }

  if (!step('main', main, 1)) return false
  if (!sel('l2')) return false
  if (!step('l2', l2, 2)) return false

  const three = sel('l3')
  if (!three) return false
  // A single option means MAM already advanced through it and posts l3=0.
  if (three.options.length > 1 && !step('l3', l3, 3)) return false

  return postBoxOpen()
}

/** MAM reveals the message box only once it accepts the chain, so this is the
 * one honest test that a topic is really set. */
export function postBoxOpen(): boolean {
  const box = document.querySelector<HTMLElement>('#postBox')
  return !!box && getComputedStyle(box).display !== 'none'
}

export interface ExtraField {
  name: string
  label: string
  placeholder: string
  required: boolean
  type: string
  /** What MAM had in the control when it was read, so a prefill still shows. */
  value: string
}

export interface ExtraInfo {
  fields: ExtraField[]
  /** MAM's pointer to the bug report forum, when this topic carries one. */
  warningHtml: string | null
  /** Whatever else MAM says, meant to sit next to the message box. */
  helperHtml: string | null
  /** A control shape this view has no widget for. MAM can add one server side
   * at any time. A value typed into it would never reach the POST. */
  unsupported: boolean
}

/** Control types the extra-field rows can actually render. */
const RENDERABLE = new Set(['text', 'url', 'email', 'number', 'tel', 'search'])

const CONTROL = 'input, select, textarea'

/** Labels MAM leaves unusable. Keyed by field name, since these mean the same
 * thing wherever they appear. */
const FIELD_LABELS: Record<string, string> = {
  seedboxProvider: 'Seedbox provider',
  seedboxIP: 'Seedbox IP address',
  vpnProvider: 'VPN provider',
}

const FIELD_HINTS: Record<string, string> = {
  seedboxIP: 'The IPv4 address staff should register, like 203.0.113.24.',
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/[:.]\s*$/, '').trim()

/** The words MAM puts beside a control. Their markup uses a table cell, a
 * wrapping label or a bare text run that ends in a `<br>`. That last shape is
 * why the walk back steps over line breaks instead of stopping at them. */
function labelFor(el: Element): string {
  const id = el.getAttribute('id')
  if (id) {
    const tagged = el.closest('#extraInfo')?.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (tagged?.textContent?.trim()) return clean(tagged.textContent)
  }
  const wrap = el.closest('label')
  if (wrap) {
    const copy = wrap.cloneNode(true) as HTMLElement
    copy.querySelectorAll(CONTROL).forEach((c) => c.remove())
    if (copy.textContent?.trim()) return clean(copy.textContent)
  }
  const cell = el.closest('td')?.parentElement?.querySelector('th, td')
  if (cell && !cell.contains(el) && cell.textContent?.trim()) return clean(cell.textContent)

  let text = ''
  for (let n = el.previousSibling; n; n = n.previousSibling) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const e = n as Element
      if (e.matches(CONTROL)) break
      if (e.tagName !== 'BR') text = (e.textContent ?? '') + text
    } else text = (n.textContent ?? '') + text
  }
  return clean(text)
}

/** Reads whatever MAM injected for the picked topic: the controls to render,
 * its pointer to the bug forum plus the rest of its wording. */
export function readExtraInfo(): ExtraInfo {
  const box = document.querySelector<HTMLElement>('#extraInfo')
  if (!box) return { fields: [], warningHtml: null, helperHtml: null, unsupported: false }

  const fields: ExtraField[] = []
  let unsupported = false
  for (const el of box.querySelectorAll<HTMLElement>(CONTROL)) {
    const c = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (!c.name || (c instanceof HTMLInputElement && c.type === 'hidden')) continue
    if (!(c instanceof HTMLInputElement) || !RENDERABLE.has(c.type)) {
      unsupported = true
      continue
    }
    fields.push({
      name: c.name,
      label: FIELD_LABELS[c.name] || labelFor(c) || humanizeFieldName(c.name),
      placeholder: c.getAttribute('placeholder') ?? '',
      required: c.required,
      type: c.type,
      value: c.value,
    })
  }

  // The element holding the forum link is the warning. Anything after it is
  // advice about the message itself.
  const link = box.querySelector(`a[href*="${BUG_FORUM}"]`)
  const banner = link ? findTop(link, box) : null

  const rest = box.cloneNode(true) as HTMLElement
  rest.querySelectorAll(CONTROL + ', label, table').forEach((e) => e.remove())
  // A label lifted from loose text still sits in the clone, so drop it there or
  // the same sentence shows twice.
  const used = new Set(fields.map((f) => f.label.toLowerCase()))
  const walker = document.createTreeWalker(rest, NodeFilter.SHOW_TEXT)
  const drop: Text[] = []
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (used.has(clean(t.textContent ?? '').toLowerCase())) drop.push(t)
  }
  drop.forEach((t) => t.remove())
  if (banner) {
    const index = [...box.childNodes].indexOf(banner)
    ;[...rest.childNodes].forEach((n, i) => { if (i <= index) n.remove() })
  }

  return {
    fields,
    warningHtml: banner ? (banner as HTMLElement).innerHTML : null,
    helperHtml: rest.textContent?.trim() ? rest.innerHTML : null,
    unsupported,
  }
}

/** The outermost node inside the box that still contains this element. */
function findTop(el: Element, box: Element): ChildNode {
  let node: Element = el
  while (node.parentElement && node.parentElement !== box) node = node.parentElement
  return node
}

/** The control MAM has in the page right now. Its restore path rebuilds
 * #extraInfo after we read it, so a held reference stops matching the
 * document. Names are stable, node identity is not. */
export function liveExtraControl(name: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  return document.querySelector(`#extraInfo [name="${CSS.escape(name)}"]`)
}

/** Puts every value back into the controls that are live at this moment. */
export function writeExtraValues(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    const el = liveExtraControl(name)
    if (el) el.value = value
  }
}

export { FIELD_HINTS, BUG_FORUM }

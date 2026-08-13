// Reads the server-rendered MAM shell into typed data. A missing element
// returns null, never a guess.

/** A notice MAM prints above the news ticker. */
export interface SiteAlert {
  href: string | null
  text: string
  tone: 'urgent' | 'info' | 'ok'
}

export interface ShellData {
  user: { name: string; uid: number | null; klass: string | null; avatar: string | null }
  stats: {
    ratio: string | null
    bonus: string | null
    bonusPerHour: string | null
    wedges: number | null
    cheese: number | null
    invites: number | null
    uploaded: string | null
    downloaded: string | null
    unsats: number | null
  }
  client: { ipv4: boolean | null; ipv6: boolean | null }
  vault: string | null
  news: { href: string; text: string }[]
  alerts: SiteAlert[]
  pmCount: number
  donationPct: string | null
  serverDate: string | null
  mainContent: HTMLElement | null
  title: string
}

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? null

function num(s: string | null | undefined): number | null {
  if (s == null) return null
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

/** Notice classes MAM styles in the strip above the news: red for the ones that
 * want an action, blue for messages plus the hunt banner, green for the
 * watchlist. Anything else falls back to blue in alertTone. */
const ALERT_TONES: [string, SiteAlert['tone']][] = [
  ['tmn', 'urgent'],
  ['topMess', 'urgent'],
  ['tmnb', 'info'],
  ['treasureHuntBanner', 'info'],
  ['tmng', 'ok'],
]

/** Classes MAM styles as a notice, wherever it puts one. */
const TONE_CLASSES = '.tmn, .tmnb, .tmng, .topMess, .treasureHuntBanner'

/** The strip MAM prints its notices in. It has no id, unlike the stat bar plus
 * the news ticker that sit in the same place. */
const ALERT_STRIP = 'div.topArea:not([id])'

/** Notices the polled counters already carry, so they are not said twice. MAM
 * gives each one a fixed id, which survives the URL moving. */
const COUNTED_IDS = new Set(['pmMess', 'ticketWatch', 'requestWatch', 'topicWatch'])

/** Same four by link, for a notice that carries no id. Written relative on the
 * page; an absolute one still has to match. */
const COUNTED_ALERT = /^(https?:\/\/[^/]+)?\/(messages\.php|ticket\.php|tor\/requests|forums\/subscriptions\.php)/

/** Tone from the notice itself or from the classed element inside it, since the
 * block around a link carries no class of its own. */
function alertTone(el: HTMLElement): SiteAlert['tone'] {
  const hit = ALERT_TONES.find(([cls]) => el.classList.contains(cls) || el.querySelector(`.${cls}`))
  // An unknown notice is a notice, not an alarm.
  return hit?.[1] ?? 'info'
}

function counted(el: HTMLElement): boolean {
  if (COUNTED_IDS.has(el.id)) return true
  for (const inner of el.querySelectorAll('[id]')) if (COUNTED_IDS.has(inner.id)) return true
  const href = el.getAttribute('href') ?? el.querySelector('a')?.getAttribute('href') ?? ''
  return href !== '' && COUNTED_ALERT.test(href)
}

/** One element per notice. A classed element is the unit, so a strip holding
 * two of them yields two. A strip with no classed element is a notice itself,
 * which covers a shape we have not seen yet. */
function alertParts(doc: Document): HTMLElement[] {
  const parts: HTMLElement[] = []
  const add = (el: HTMLElement) => {
    // Page content is not a site notice. hideMe marks MAM's empty placeholders,
    // which can sit on the link or on the block around it.
    if (el.closest('#mainBody, main, .hideMe')) return
    if (parts.some((t) => t.contains(el) || el.contains(t))) return
    parts.push(el)
  }
  for (const el of doc.querySelectorAll<HTMLElement>(TONE_CLASSES)) add(el)
  for (const strip of doc.querySelectorAll<HTMLElement>(ALERT_STRIP)) {
    if (!strip.querySelector(TONE_CLASSES)) add(strip)
  }
  return parts.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  )
}

/** MAM's own header notices. The counters have their own badges, so what stays
 * here is everything else: deleted snatches, client warnings and whatever MAM
 * adds next. */
function readAlerts(doc: Document): SiteAlert[] {
  const out: SiteAlert[] = []
  for (const el of alertParts(doc)) {
    const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!text || counted(el)) continue
    out.push({
      href: el.getAttribute('href') ?? el.querySelector('a')?.getAttribute('href') ?? null,
      text,
      tone: alertTone(el),
    })
  }
  return out
}

/** Value of a user-submenu entry, by label ("FL Wedges: N" -> "N"). */
function userMenuValue(doc: Document, label: RegExp): string | null {
  const items = doc.querySelectorAll('li.mmUserStats ul li a')
  for (const a of items) {
    const t = a.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const m = t.match(label)
    if (m) return (m[1] ?? '').trim() || null
  }
  return null
}

export function capturePage(doc: Document): ShellData {
  const myInfo = doc.querySelector<HTMLAnchorElement>('li.mmUserStats a.myInfo')
  // Preferences and other userscripts can reshape the menu; the session cookie
  // carries the uid whatever the markup looks like.
  const uid =
    num(myInfo?.getAttribute('href')?.match(/\/u\/(\d+)/)?.[1] ?? null) ??
    num(doc.cookie.match(/(?:^|;\s*)uid=(\d+)/)?.[1] ?? null)

  // #userMenu's first text node is the username (icons and arrows follow).
  const userMenu = doc.querySelector('#userMenu')
  let name = ''
  for (const node of userMenu?.childNodes ?? []) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      name = node.textContent.trim()
      break
    }
  }

  const klassRaw = text(doc.querySelector('li.mmUserStats li.tmC a'))
  const klass = klassRaw?.replace(/[()]/g, '').trim() || null

  const clientImgs = doc.querySelectorAll<HTMLImageElement>('#tmCo img')
  const connectable = (img: HTMLImageElement | undefined): boolean | null =>
    img ? img.classList.contains('connectable') : null

  const newsLinks = new Map<string, string>()
  for (const a of doc.querySelectorAll<HTMLAnchorElement>(
    '#hrnews #js-news a, #hrnews .ticker-content a, #hrnews a[href^="/f/t/"], #hrnews a[href^="/lotto/"]'
  )) {
    const href = a.getAttribute('href') ?? ''
    const t = a.textContent?.trim() ?? ''
    if (href && t && !newsLinks.has(href)) newsLinks.set(href, t)
  }

  const pmCount =
    num(text(doc.querySelector('#sbNotifs #hiddenPMcount'))) ??
    num(text(doc.querySelector('a#pmMess'))) ??
    0

  const donationRaw = text(doc.querySelector('li.mmDonBox > a'))

  // Avatar only present when the user enabled the header-avatar preference.
  const avatar =
    doc.querySelector<HTMLImageElement>('#userMenu img.avatar, li.mmUserStats img[src*="avatar"], #userStat img[src*="avatar"]')?.getAttribute('src') ?? null

  return {
    user: { name, uid, klass, avatar },
    stats: {
      ratio: text(doc.querySelector('#tmR'))?.replace(/\s.*$/, '') ?? null,
      bonus: userMenuValue(doc, /^Bonus:\s*([\d,.]+)/) ?? text(doc.querySelector('#tmBP'))?.replace(/^Bonus:\s*/, '') ?? null,
      bonusPerHour: userMenuValue(doc, /^B\/hr:\s*([\d,.]+)/),
      wedges: num(userMenuValue(doc, /^FL Wedges:\s*([\d,]+)/)),
      cheese: num(userMenuValue(doc, /^Cheese:\s*([\d,]+)/)),
      invites: num(text(doc.querySelector('#tmIN'))),
      // "Uploaded:" lives in the <img alt>, not in textContent, so match the
      // size out of #uploadedTD/#downloadedTD directly.
      uploaded: text(doc.querySelector('#uploadedTD'))?.match(/[\d.,]+\s*[KMGTP]?i?B/i)?.[0] ?? null,
      downloaded: text(doc.querySelector('#downloadedTD'))?.match(/[\d.,]+\s*[KMGTP]?i?B/i)?.[0] ?? null,
      unsats: num(userMenuValue(doc, /Unsat\(s\):\s*([\d,]+)/)),
    },
    client: { ipv4: connectable(clientImgs[0]), ipv6: connectable(clientImgs[1]) },
    vault: num(text(doc.querySelector('#millionInfo')))?.toLocaleString('en-US') ?? null,
    news: [...newsLinks].map(([href, t]) => ({ href, text: t })),
    alerts: readAlerts(doc),
    pmCount,
    donationPct: donationRaw?.match(/([\d.]+%)/)?.[1] ?? null,
    serverDate: doc.querySelector('#preNav .tP')?.getAttribute('data-basedate') ?? null,
    mainContent: doc.querySelector<HTMLElement>('#mainBody') ?? doc.querySelector<HTMLElement>('main'),
    title: doc.title.replace(/\s*\|\s*My Anonamouse\s*$/, ''),
  }
}

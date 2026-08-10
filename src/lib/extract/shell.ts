// Reads the server-rendered MAM shell into typed data. A missing element
// returns null, never a guess.

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
    pmCount,
    donationPct: donationRaw?.match(/([\d.]+%)/)?.[1] ?? null,
    serverDate: doc.querySelector('#preNav .tP')?.getAttribute('data-basedate') ?? null,
    mainContent: doc.querySelector<HTMLElement>('#mainBody') ?? doc.querySelector<HTMLElement>('main'),
    title: doc.title.replace(/\s*\|\s*My Anonamouse\s*$/, ''),
  }
}

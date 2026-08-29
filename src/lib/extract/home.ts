// Extractors for the front page (#mainBody blocks). Every block is optional;
// missing markup yields [].
import { cleanHtml } from '@/lib/sanitize'

export interface NewsItem { date: string | null; href: string; text: string; sub: boolean }
export interface Shout {
  id: string
  time: string | null
  user: { name: string; uid: number | null; color: string | null; country: { name: string; src: string } | null } | null
  text: string
  /** Message as sanitized HTML (smilies kept as <img>, mentions colored). The
   * shoutbox view renders this; the dashboard keeps using `text`. */
  html: string | null
  /** MAM flags your own shout as editable (within its edit window) via
   * .sb_menu[data-ee="1"]; the shoutbox view shows an inline edit action for it. */
  editable: boolean
}
export interface HomeTorrent {
  id: number
  title: string
  href: string
  mediaClass: string | null
  vip: boolean
  vipExpires: string | null
  explicit: boolean
  authors: { name: string; href: string }[]
  narrators: { name: string; href: string }[]
  series: { name: string; href: string; part: string | null } | null
  desc: string | null
  fileTypes: string[]
  comments: number
  categories: { name: string; href: string | null; language: boolean }[]
  files: number | null
  size: string | null
  added: string | null
  uploader: { name: string; href: string } | null
  seeders: number | null
  leechers: number | null
  snatched: number | null
}
export interface ForumPost {
  title: string
  href: string
  board: string | null
  boardHref: string | null
  replies: string
  views: string
  author: string | null
  lastAt: string | null
  lastBy: string | null
  lastHref: string | null
}
export interface ServerStat { name: string; cpuAvail: number | null }
export interface HomeData {
  news: NewsItem[]
  shouts: Shout[]
  torrents: HomeTorrent[]
  posts: ForumPost[]
  members: { name: string; href: string; color: string | null }[]
  stats: { label: string; value: string }[]
  servers: ServerStat[]
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null

/** Lucide corner-down-right, inlined: replaces MAM's quick_reply.gif "jump to
 * quote" arrow inside a shout body with a clean, muted mark in our own voice. */
const QUOTE_JUMP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="m15 10 5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>'

function n(s: string | null | undefined): number | null {
  if (s == null) return null
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

export function extractShouts(scope: ParentNode): Shout[] {
  const out: Shout[] = []
  for (const div of scope.querySelectorAll<HTMLElement>('div[id^="sbid"]')) {
    const time = div.querySelector('.ts')?.getAttribute('title') ?? txt(div.querySelector('.ts'))
    const userA = div.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const uid = n(userA?.getAttribute('href')?.match(/\/u\/(\d+)/)?.[1])
    const span = userA?.querySelector('span')
    // MAM shows a country flag (img.sb_country) inside the user link when the
    // viewer's "show flags" setting is on; lift it so the view can echo it.
    const flag = userA?.querySelector<HTMLImageElement>('img.sb_country')
    const country = flag
      ? { name: (flag.getAttribute('title') || flag.getAttribute('alt') || '').trim(), src: flag.getAttribute('src') ?? '' }
      : null
    const user = userA
      ? { name: txt(span) ?? txt(userA) ?? '', uid, color: span?.getAttribute('data-uc') ?? null, country }
      : null

    // Message = everything after the "<a>user</a>: " part. Keep two forms: the
    // sanitized HTML (smilies as <img>, colored mentions) for the shoutbox and
    // flattened text (smiley alts) for the dashboard.
    const clone = div.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.ts, .sb_menu, .sbNewQuote, .sbAt, svg').forEach((e) => e.remove())
    clone.querySelector('a[href^="/u/"]')?.remove()
    // MAM's "jump to quote" arrow is a bare gif whose alt ("jump to quote") also
    // leaks into the flattened text; swap it for a clean inline mark before both
    // forms are derived.
    clone.querySelectorAll('img.sbQuote').forEach((img) => {
      const mark = document.createElement('span')
      mark.className = 'sb-quote-jump'
      mark.setAttribute('aria-hidden', 'true')
      mark.innerHTML = QUOTE_JUMP_SVG
      img.replaceWith(mark)
    })
    const rawHtml = cleanHtml(clone)
    const html = rawHtml ? rawHtml.replace(/^\s*:\s*/, '') : null
    const textClone = clone.cloneNode(true) as HTMLElement
    textClone.querySelectorAll('img').forEach((img) => img.replaceWith(img.getAttribute('alt') ?? ''))
    const text = (textClone.textContent?.replace(/\s+/g, ' ').trim() ?? '').replace(/^:\s*/, '')
    const editable = div.querySelector('.sb_menu')?.getAttribute('data-ee') === '1'
    out.push({ id: div.id, time, user, text, html, editable })
  }
  return out
}

export function extractTorrentRows(scope: ParentNode): HomeTorrent[] {
  const out: HomeTorrent[] = []
  for (const tr of scope.querySelectorAll<HTMLTableRowElement>('table.newTorTable tr.torrentInfo')) {
    const id = n(tr.getAttribute('data-tid'))
    const titleA = tr.querySelector<HTMLAnchorElement>('a.torTitle')
    if (!id || !titleA) continue
    const cells = tr.querySelectorAll('td')
    const links = (sel: string) =>
      [...tr.querySelectorAll<HTMLAnchorElement>(sel)].map((a) => ({
        name: txt(a) ?? '',
        href: a.getAttribute('href') ?? '',
      }))
    const seriesA = tr.querySelector<HTMLAnchorElement>('.torSeries a.series')
    const seriesPart = tr.querySelector('.torSeries')?.textContent?.match(/\(#([\d.]+)\)/)?.[1] ?? null
    const vipImg = tr.querySelector<HTMLImageElement>('img[alt^="VIP"]')
    const slsCell = cells[cells.length - 1]
    const sls = [...(slsCell?.querySelectorAll('p') ?? [])].map((p) => n(p.textContent))
    const filesCell = cells[cells.length - 3]
    const dateCell = cells[cells.length - 2]
    const uploaderA = dateCell?.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const commentsMatch = tr.querySelector('.torFileTypes')?.parentElement?.textContent?.match(/(\d+)\s+comments/)

    out.push({
      id,
      title: txt(titleA) ?? '',
      href: titleA.getAttribute('href') ?? `/t/${id}`,
      mediaClass: tr.querySelector('a.newCatLink div')?.className ?? null,
      vip: !!vipImg,
      vipExpires: vipImg?.getAttribute('alt')?.match(/expires\s+(.+)/)?.[1] ?? null,
      explicit: !!tr.querySelector('img[alt*="Explicit" i]'),
      authors: links('.torAuthors a.author'),
      narrators: links('.torNarrator a.narrator'),
      series: seriesA
        ? { name: txt(seriesA) ?? '', href: seriesA.getAttribute('href') ?? '', part: seriesPart }
        : null,
      desc: txt(tr.querySelector('.torRowDesc')),
      fileTypes: [...tr.querySelectorAll('.torFileTypes a')].map((a) => txt(a) ?? '').filter(Boolean),
      comments: n(commentsMatch?.[1]) ?? 0,
      categories: [...tr.querySelectorAll<HTMLAnchorElement>('.searchMultiCat a.mCat')].map((a) => ({
        name: txt(a) ?? '',
        href: a.getAttribute('href'),
        language: a.classList.contains('language'),
      })),
      files: n(txt(filesCell?.querySelector('a'))),
      size: filesCell?.textContent?.match(/\[([^\]]+)\]/)?.[1] ?? null,
      added: dateCell?.textContent?.match(/(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2}:\d{2})?/)?.[0] ?? null,
      uploader: uploaderA ? { name: txt(uploaderA) ?? '', href: uploaderA.getAttribute('href') ?? '' } : null,
      seeders: sls[0] ?? null,
      leechers: sls[1] ?? null,
      snatched: sls[2] ?? null,
    })
  }
  return out
}

export function extractHome(doc: Document): HomeData {
  const main = doc.querySelector('#mainBody')
  if (!main) return { news: [], shouts: [], torrents: [], posts: [], members: [], stats: [], servers: [] }

  const news: NewsItem[] = [...main.querySelectorAll<HTMLElement>('.mainPageNews, .mainPageNewsSub')].map((div) => {
    const a = div.querySelector('a')
    return {
      date: div.textContent?.match(/\[(\d{4}-\d{2}-\d{2})\]/)?.[1] ?? null,
      href: a?.getAttribute('href') ?? '#',
      text: txt(a) ?? '',
      sub: div.classList.contains('mainPageNewsSub'),
    }
  })

  const posts: ForumPost[] = [...main.querySelectorAll<HTMLTableRowElement>('#fpPostsContent tr.tableb')].map((tr) => {
    const tds = tr.querySelectorAll('td')
    const link = tr.querySelector<HTMLAnchorElement>('a.forumLink')
    const board = tr.querySelector<HTMLAnchorElement>('sub a')
    const authorA = tds[3]?.querySelector('a')
    const lastTd = tds[4]
    const lastBy = lastTd?.querySelector('a[href^="/u/"]')
    const lastGo = lastTd?.querySelector<HTMLAnchorElement>('a[href*="/p/"]')
    return {
      title: txt(link) ?? '',
      href: link?.getAttribute('href') ?? '#',
      board: txt(board),
      boardHref: board?.getAttribute('href') ?? null,
      replies: txt(tds[1]) ?? '0',
      views: txt(tds[2]) ?? '0',
      author: txt(authorA),
      lastAt: lastTd?.textContent?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null,
      lastBy: txt(lastBy),
      lastHref: lastGo?.getAttribute('href') ?? null,
    }
  })

  const members = [...main.querySelectorAll<HTMLAnchorElement>('#newestMembers a')].map((a) => ({
    name: txt(a) ?? '',
    href: a.getAttribute('href') ?? '#',
    color: a.querySelector('span')?.style.color || null,
  }))

  // fpStats: pull the interesting label/value pairs out of the 6-col table.
  const stats: { label: string; value: string }[] = []
  for (const tr of main.querySelectorAll('#fpStats table tr')) {
    const tds = [...tr.querySelectorAll('td')].map((td) => txt(td) ?? '')
    if (tds.length >= 4 && tds[0] && tds[3] && tds[2] === '/') stats.push({ label: tds[0], value: `${tds[1]} / ${tds[3]}` })
    else if (tds.length >= 4 && tds[0] && tds[3] && !tds[1] && !tds[2]) stats.push({ label: tds[0], value: tds[3] })
    const tail = tds.slice(-2)
    if (tail.length === 2 && tail[0] && tail[1] && !['/',''].includes(tail[0]) && tail[0] !== tds[0]) {
      stats.push({ label: tail[0], value: tail[1] })
    }
  }

  const servers: ServerStat[] = [...main.querySelectorAll<HTMLElement>('#fpStatsCon .servStatBlock')].map((b) => ({
    name: txt(b.querySelector('b')) ?? 'server',
    cpuAvail: n(b.textContent?.match(/CPU:\s*\(([\d.]+)\s*% available\)/)?.[1]),
  }))

  return {
    news,
    shouts: extractShouts(main.querySelector('#sbf') ?? main),
    torrents: extractTorrentRows(main),
    posts,
    members,
    stats,
    servers,
  }
}

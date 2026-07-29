// Torrent detail extractor (#torDetMainCon). Rows are label/content pairs and
// are conditional per torrent - we map known labels and keep the rest verbatim
// so nothing on the page is lost.

export interface LinkItem { name: string; href: string }
export interface DetailTile { label: string; html: string; id: string | null }
/** One node of MAM's MediaInfo tree: a heading with children or a key: value. */
export interface MediaNode { label: string; value: string | null; children: MediaNode[] }
export interface TorrentDetail {
  id: number | null
  poster: string | null
  title: string | null
  authors: LinkItem[]
  narrators: LinkItem[]
  series: { name: string; href: string; part: string | null }[]
  tags: string | null
  categories: { name: string; href: string; language: boolean }[]
  catIconHref: string | null
  size: string | null
  files: { count: string | null }
  mediaInfoMicro: string | null
  mediaInfoHtml: string | null
  mediaInfoFullHref: string | null
  mediaInfo: MediaNode[]
  fileTypes: string[]
  bookmarkId: string | null
  vip: boolean
  vipExpires: string | null
  clone: string | null
  tiles: DetailTile[]
  downloadHref: string | null
  downloadBlocked: string | null
  // MAM's label for your own history with this torrent ("Actively Seeding"),
  // absent when you never had it.
  dlHistory: string | null
  seeders: string | null
  leechers: string | null
  snatched: string | null
  added: string | null
  uploader: { name: string; href: string; color: string | null } | null
  ratioHtml: string | null
  // Structured non-freeleech ratio tile: projected ratio + freeleech purchase
  // buttons (proxied to MAM's hidden input[data-freetor]) + trailing status.
  ratio: {
    wouldBecome: string | null
    buttons: { label: string; name: string | null; torId: string }[]
    note: string | null
  } | null
  freeleech: boolean
  personalFreeleech: boolean
  reseed: { status: string | null; reason: string | null; actionHref: string | null } | null
  blockedClassesHref: string | null
  hasFilelist: boolean
  hasPeers: boolean
  descriptionHtml: string | null
  comments: TorrentComment[]
  commentCount: string | null
  addCommentHref: string | null
  reportIssueHref: string | null
  hasSubmitInfo: boolean
  extraRows: { label: string; html: string }[]
}

export interface TorrentComment {
  id: string
  author: { name: string; href: string; color: string | null } | null
  authorClass: string | null
  donor: boolean
  at: string | null
  avatar: string | null
  bodyHtml: string
}

/** Parse #CommentArea's commentsTable: each comment = header row + body row. */
function extractComments(doc: Document): TorrentComment[] {
  const table = doc.querySelector('#CommentArea .commentsTable, #CommentArea table.coltable')
  if (!table) return []
  const rows = [...table.querySelectorAll(':scope > tbody > tr, :scope > tr')]
  const out: TorrentComment[] = []
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i]
    const headCell = header.querySelector('td[colspan]')
    if (!headCell) continue
    const body = rows[i + 1]
    const bodyCell = body?.querySelector('td[id^="tcid-"]')
    const authorA = headCell.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const headText = headCell.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    out.push({
      id: headText.match(/#(\d+)/)?.[1] ?? String(i),
      author: authorA ? { name: txt(authorA) ?? '', href: authorA.getAttribute('href') ?? '#', color: (authorA as HTMLElement).style?.color || null } : null,
      authorClass: headText.match(/\(([^)]+)\)/)?.[1] ?? null,
      donor: !!headCell.querySelector('img[alt="Donor"], img[src*="star"]'),
      at: headText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null,
      avatar: body?.querySelector<HTMLImageElement>('img.avatar')?.getAttribute('src') ?? null,
      bodyHtml: clean(bodyCell) ?? '',
    })
    if (bodyCell) i++
  }
  return out
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null

/** #mediaInfoDisplay is nested divs: one whose first <b> is a heading holds more
 * divs, one whose <b> is a key holds ": value" as trailing text. Wrapper divs
 * without a <b> flatten into their parent. */
export function parseMediaTree(container: Element | null): MediaNode[] {
  if (!container) return []
  const out: MediaNode[] = []
  for (const child of container.children) {
    if (child.tagName !== 'DIV') continue
    const b = [...child.childNodes].find((n) => n.nodeName === 'B') as Element | undefined
    if (b) {
      let value = ''
      for (const n of child.childNodes) {
        if (n === b) continue
        if (n.nodeType === Node.TEXT_NODE) value += n.textContent
      }
      out.push({
        label: (b.textContent ?? '').replace(/\s+/g, ' ').replace(/:$/, '').trim(),
        value: value.replace(/^[:\s]+/, '').replace(/\s+/g, ' ').trim() || null,
        children: parseMediaTree(child),
      })
    } else {
      out.push(...parseMediaTree(child))
    }
  }
  return out
}

// Sanitize MAM-served fragments before re-rendering: drop active elements,
// inline handlers and javascript: URLs (defense against re-executing markup).
function clean(el: Element | null | undefined): string | null {
  if (!el) return null
  const c = el.cloneNode(true) as HTMLElement
  c.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach((x) => x.remove())
  for (const node of c.querySelectorAll<HTMLElement>('*')) {
    for (const attr of [...node.attributes]) {
      const n = attr.name.toLowerCase()
      const v = attr.value.trim().toLowerCase()
      if (n.startsWith('on')) node.removeAttribute(attr.name)
      else if ((n === 'href' || n === 'src' || n === 'action') && (v.startsWith('javascript:') || v.startsWith('data:text/html'))) {
        node.removeAttribute(attr.name)
      }
    }
  }
  return c.innerHTML.trim() || null
}

export function extractTorrent(doc: Document): TorrentDetail | null {
  const con = doc.querySelector('#torDetMainCon')
  if (!con) return null

  const links = (root: Element | null, sel: string): LinkItem[] =>
    root
      ? [...root.querySelectorAll<HTMLAnchorElement>(sel)].map((a) => ({
          name: txt(a) ?? '',
          href: a.getAttribute('href') ?? '',
        }))
      : []

  const rows = [...con.querySelectorAll(':scope > .torDetRow')]
  const byLabel = new Map<string, Element>()
  const extraRows: { label: string; html: string }[] = []
  for (const row of rows) {
    const label = txt(row.querySelector('.torDetLeft'))?.replace(/:$/, '') ?? ''
    byLabel.set(label.toLowerCase().replace(/\s+#\d+$/, ''), row)
  }

  const known = new Set([
    'title', 'author', 'narrator', 'submit information', 'tags and labels', 'file info', 'series',
    'report issue', 'torrent',
  ])
  for (const row of rows) {
    const rawLabel = txt(row.querySelector('.torDetLeft')) ?? ''
    const key = rawLabel.replace(/:$/, '').toLowerCase().replace(/\s*#\d+.*$/, '').replace(/\s+bookmark.*$/i, '').trim()
    if (![...known].some((k) => key.startsWith(k))) {
      extraRows.push({ label: rawLabel, html: clean(row.querySelector('.torDetRight')) ?? '' })
    }
  }

  const right = (label: string) => byLabel.get(label)?.querySelector('.torDetRight') ?? null

  const seriesEls = con.querySelectorAll<HTMLAnchorElement>('.torDetRow .torDetRight a[href*="browse.php?series"], .torSeries a')
  const series = [...seriesEls].map((a) => ({
    name: txt(a) ?? '',
    href: a.getAttribute('href') ?? '',
    part: a.parentElement?.textContent?.match(/\(#([\d.]+)\)/)?.[1] ?? null,
  }))

  const torrentRow = [...rows].find((r) => txt(r.querySelector('.torDetLeft'))?.startsWith('Torrent'))
  const tiles: DetailTile[] = []
  let downloadHref: string | null = null
  for (const tile of torrentRow?.querySelectorAll('.torDetInnerCon') ?? []) {
    const label = txt(tile.querySelector('.torDetInnerTop')) ?? ''
    const bottom = tile.querySelector('.torDetInnerBottomSpan, .torDetInnerBottom')
    const dl = tile.querySelector<HTMLAnchorElement>('a[href*="/tor/download.php"]')
    if (dl) downloadHref = dl.getAttribute('href')
    tiles.push({ label, html: clean(bottom) ?? '', id: tile.id || null })
  }

  // Tiles without a dedicated control land in extraRows so nothing is lost.
  const knownTile = /^(size|files|mediainfo|filetypes|download|ratio|seeds|leech|request\s*reseed|added|uploader)/i
  for (const tile of tiles) {
    if (tile.label && !knownTile.test(tile.label)) {
      extraRows.push({ label: tile.label.replace(/:$/, ''), html: tile.html })
    }
  }

  const sls = torrentRow?.querySelector('#sls')
  const uploaderA = torrentRow?.querySelector<HTMLAnchorElement>('#uploader a[href^="/u/"]')

  // Ratio / pricing tile ("VIP Freeleech! Permanent VIP" or the ratio cost).
  const ratioBottom = torrentRow?.querySelector('#ratio .torDetInnerBottomSpan')
  const ratioHtml = clean(ratioBottom)
  const freeleech = /freeleech|free ?leech/i.test(ratioBottom?.textContent ?? '')
  const personalFreeleech = /personal\s+free/i.test(ratioBottom?.textContent ?? '')

  // Non-freeleech torrents show freeleech purchase buttons (<input data-freetor>,
  // e.g. "Buy as FL") that MAM wires via a delegated handler our shadow DOM never
  // receives. Pull them out as real actions; the button's `value` is not part of
  // textContent, so the leftover text after "Would become X" is the status note.
  let ratio: TorrentDetail['ratio'] = null
  if (ratioBottom) {
    const buttons = [...ratioBottom.querySelectorAll<HTMLInputElement>('input[data-freetor]')].map((b) => ({
      label: (b.getAttribute('value') ?? '').trim(),
      name: b.getAttribute('name'),
      torId: b.getAttribute('data-freetor') ?? '',
    })).filter((b) => b.label && b.torId)
    if (buttons.length) {
      const wouldBecome =
        txt(ratioBottom.querySelector('span[style*="color"]')) ??
        ratioBottom.textContent?.match(/Would become\s+([\d.,]+)/i)?.[1] ??
        null
      const note = (ratioBottom.textContent ?? '')
        .replace(/Would become\s*[\d.,]+/i, '')
        .replace(/\s+/g, ' ')
        .trim() || null
      ratio = { wouldBecome, buttons, note }
    }
  }

  // Reseed request tile: a status line plus either a "Find out why" note
  // (data-moreinfo) or an actionable link when eligible.
  const reseedBottom = torrentRow?.querySelector('#reseedRequest .torDetInnerBottomSpan')
  let reseed: TorrentDetail['reseed'] = null
  if (reseedBottom) {
    const moreInfoA = reseedBottom.querySelector<HTMLElement>('a[data-moreinfo]')
    const actionA = reseedBottom.querySelector<HTMLAnchorElement>('a[href]')
    // Status = the tile text with the anchor's own words removed.
    const anchorText = (moreInfoA ?? actionA)?.textContent ?? ''
    const status = (reseedBottom.textContent ?? '').replace(anchorText, '').replace(/\s+/g, ' ').trim() || null
    reseed = {
      status,
      reason: moreInfoA?.getAttribute('data-moreinfo') ?? null,
      actionHref: actionA?.getAttribute('href') ?? null,
    }
  }

  // "Download Rank Blocked" tile links to the class explainer in the FAQ.
  const blockedClassesHref =
    torrentRow?.querySelector<HTMLAnchorElement>('.torDetInnerCon a[href*="faq.php"]')?.getAttribute('href') ?? null

  const fInfo = doc.querySelector('#fInfo')
  const commentArea = doc.querySelector('#CommentArea')
  const vipImg = torrentRow?.querySelector<HTMLImageElement>('img[alt^="VIP"]')

  return {
    id: Number(location.pathname.match(/\/t\/(\d+)/)?.[1] ?? doc.querySelector('#thanksArea input[name="tid"]')?.getAttribute('value')) || null,
    poster: doc.querySelector<HTMLImageElement>('#torDetPoster')?.getAttribute('src') ?? null,
    title: txt(con.querySelector('.TorrentTitle')),
    authors: links(right('author'), 'a'),
    narrators: links(right('narrator'), 'a'),
    series,
    tags: txt(right('tags and labels')),
    // Language entries carry class "language", same marker home.ts relies on.
    categories: fInfo
      ? [...fInfo.querySelectorAll<HTMLAnchorElement>('#multiCat a.mCat')].map((a) => ({
          name: txt(a) ?? '',
          href: a.getAttribute('href') ?? '',
          language: a.classList.contains('language'),
        }))
      : [],
    catIconHref: fInfo?.querySelector<HTMLAnchorElement>('a.newCatLink')?.getAttribute('href') ?? null,
    size: txt(doc.querySelector('#size .torDetInnerBottomSpan')),
    files: { count: txt(doc.querySelector('#files .torDetInnerBottomSpan span'))?.match(/^\d[\d,]*/)?.[0] ?? null },
    mediaInfoMicro: txt(doc.querySelector('#mediaInfoMicro')),
    mediaInfoHtml: clean(doc.querySelector('#mediaInfoDisplay')),
    mediaInfoFullHref: doc.querySelector<HTMLAnchorElement>('#mediaInfoDisplay a[href^="/t/m/"]')?.getAttribute('href') ?? null,
    mediaInfo: parseMediaTree(doc.querySelector('#mediaInfoDisplay')),
    fileTypes: [...(doc.querySelectorAll('#PrimaryFileTypes a') ?? [])].map((a) => txt(a) ?? '').filter(Boolean),
    bookmarkId: torrentRow?.querySelector('[id^="torBookmark"]')?.id ?? null,
    vip: !!vipImg,
    vipExpires: vipImg?.getAttribute('alt')?.match(/expires\s+(.+)/i)?.[1]?.trim() ?? null,
    clone: torrentRow?.querySelector<HTMLAnchorElement>('a[href*="clone"]')?.getAttribute('href') ?? null,
    tiles,
    downloadHref,
    downloadBlocked: tiles.find((t) => /blocked/i.test(t.label))?.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? null,
    dlHistory: txt(doc.querySelector('#DLhistory')) || null,
    seeders: txt(sls?.querySelector('.torDetInnerTop a')) ?? null,
    leechers: txt(sls?.querySelector('.torDetInnerBottomSpan a')) ?? null,
    snatched: sls?.textContent?.match(/Snatched:\s*([\d,]+)/)?.[1] ?? null,
    added: (() => {
      const raw = txt(torrentRow?.querySelector('#added .torDetInnerBottomSpan')) ?? ''
      const m = raw.match(/(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2}:\d{2})?/)
      return m ? [m[1], m[2]].filter(Boolean).join(' ') : raw || null
    })(),
    uploader: uploaderA
      ? { name: txt(uploaderA) ?? '', href: uploaderA.getAttribute('href') ?? '', color: (uploaderA as HTMLElement).style?.color || null }
      : null,
    ratioHtml,
    ratio,
    freeleech,
    personalFreeleech,
    reseed,
    blockedClassesHref,
    hasFilelist: !!doc.querySelector('[data-filelist]'),
    hasPeers: !!doc.querySelector('[data-tpeerslist]'),
    descriptionHtml: clean(doc.querySelector('#torDesc')),
    comments: extractComments(doc),
    commentCount: commentArea?.textContent?.match(/(\d+)\s+comments?/i)?.[1] ?? null,
    addCommentHref: commentArea?.querySelector<HTMLAnchorElement>('a[href*="comment.php?action=add"]')?.getAttribute('href') ?? null,
    // Secondary torDetRows we render as dedicated controls (their labels stay in
    // `known` so they don't also surface as raw extraRows).
    reportIssueHref: con.querySelector<HTMLAnchorElement>('a[href*="ticket.php/newTicket"]')?.getAttribute('href') ?? null,
    hasSubmitInfo: !!con.querySelector('#submitInfo [data-tormissdataj]'),
    extraRows,
  }
}

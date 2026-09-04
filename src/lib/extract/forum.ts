// Forum extractors: index (/f), board (/f/b/N), topic (/f/t/N).

import { cleanHtml } from '@/lib/sanitize'

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null

function n(s: string | null | undefined): number | null {
  if (s == null) return null
  const m = s.replace(/,/g, '').match(/-?\d+/)
  return m ? Number(m[0]) : null
}

export interface ForumBoard {
  name: string
  href: string
  desc: string | null
  subBoards: { name: string; href: string; hasNew: boolean }[]
  topics: string | null
  posts: string | null
  hasNew: boolean
  locked: boolean
  last: { at: string | null; by: string | null; byColor: string | null; topic: string | null; href: string | null }
}

export interface ForumCategory {
  name: string
  href: string | null
  boards: ForumBoard[]
}

export function extractForumIndex(doc: Document): ForumCategory[] {
  const table = doc.querySelector('#mainForum')
  if (!table) return []
  const cats: ForumCategory[] = []
  for (const tr of table.querySelectorAll('tr')) {
    const colhead = tr.querySelector('td.colhead h4 a')
    if (colhead) {
      cats.push({ name: txt(colhead) ?? '', href: colhead.getAttribute('href'), boards: [] })
      continue
    }
    const link = tr.querySelector<HTMLAnchorElement>('a.forumLink')
    if (!link || cats.length === 0) continue
    const tds = tr.querySelectorAll(':scope > td')
    const icon = tr.querySelector('img[src*="lock"], img[src*="unlock"]')
    const lastTd = tr.querySelector('td.lastPost')
    const lastBy = lastTd?.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const lastTopic = lastTd?.querySelector<HTMLAnchorElement>('a.newestPost')
    cats[cats.length - 1].boards.push({
      name: txt(link) ?? '',
      href: link.getAttribute('href') ?? '#',
      desc: txt(tr.querySelector('.forDesc')),
      subBoards: [...tr.querySelectorAll<HTMLAnchorElement>('.subBoard a')].map((a) => ({
        name: txt(a) ?? '',
        href: a.getAttribute('href') ?? '#',
        hasNew: !!a.querySelector('img[alt="new post"]'),
      })),
      topics: txt(tds[2]),
      posts: txt(tds[3]),
      hasNew: !!icon?.getAttribute('src')?.includes('new'),
      locked: !!icon?.getAttribute('src')?.match(/\/locked/),
      last: {
        at: lastTd?.textContent?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null,
        by: txt(lastBy),
        byColor: lastBy?.querySelector('span')?.style.color || null,
        topic: txt(lastTopic),
        href: lastTopic?.getAttribute('href') ?? null,
      },
    })
  }
  return cats
}

export interface BoardTopic {
  title: string
  /** The state staff gave this topic, on the boards that track one. */
  tag: string | null
  href: string
  sticky: boolean
  locked: boolean
  hasNew: boolean
  pages: { label: string; href: string }[]
  replies: string | null
  views: string | null
  author: string | null
  authorColor: string | null
  last: { at: string | null; by: string | null; byColor: string | null; href: string | null }
}

/** MAM builds a topic's page links from its reply count, so a topic whose posts
 * land exactly on a page boundary lists one page too few. Every multi-page row
 * narrows the reader's posts-per-page setting, since P pages over R replies
 * means R/P <= perPage <= (R-1)/(P-1). Returns null when nothing pins it down. */
function postsPerPage(rows: { replies: number; pages: number }[]): number | null {
  let lo = 1
  let hi = Infinity
  for (const r of rows) {
    if (r.pages < 2 || r.replies < 1) continue
    lo = Math.max(lo, Math.ceil(r.replies / r.pages))
    hi = Math.min(hi, Math.floor((r.replies - 1) / (r.pages - 1)))
  }
  return hi !== Infinity && lo <= hi ? lo : null
}

/** The boards that track one open a topic row with a bracketed state, as loose
 * text before the link, where a sticky row also puts its icon. Reading up to the
 * link leaves a title that opens with brackets alone, since that sits inside. */
function tagBefore(cell: Element, link: Element): string | null {
  let text = ''
  for (const node of cell.childNodes) {
    if (node.contains(link)) break
    text += node.textContent ?? ''
  }
  return text.match(/^\s*\[([^\]]+)\]/)?.[1].trim() || null
}

export interface BoardData {
  crumbs: { name: string; href: string | null }[]
  actions: { label: string; href: string }[]
  pages: { label: string; href: string; current: boolean }[]
  topics: BoardTopic[]
}

export function extractBoard(doc: Document): BoardData | null {
  const table = doc.querySelector('.forumViewTable')
  const main = doc.querySelector('#mainBody')
  if (!table || !main) return null

  const crumbs: BoardData['crumbs'] = []
  const h1 = main.querySelector('h1')
  for (const node of h1?.childNodes ?? []) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('a')) {
      crumbs.push({ name: txt(node as Element) ?? '', href: (node as Element).getAttribute('href') })
    } else if (node.textContent?.replace(/[>\s]+/g, '').trim()) {
      crumbs.push({ name: node.textContent.replace(/^[>\s]+|[>\s]+$/g, ''), href: null })
    }
  }

  // MAM renders the action bar twice (above and below the list); dedupe by label.
  const seenAction = new Set<string>()
  const actions = [...main.querySelectorAll<HTMLAnchorElement>('.fL a.forumButtonLink')]
    .map((a) => ({ label: txt(a) ?? '', href: a.getAttribute('href') ?? '#' }))
    .filter((a) => a.label !== '' && !seenAction.has(a.label) && (seenAction.add(a.label), true))

  const pages: BoardData['pages'] = []
  const pageSpan = main.querySelector('.fR')
  for (const node of pageSpan?.childNodes ?? []) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('a')) {
      const a = node as HTMLAnchorElement
      const label = txt(a) ?? ''
      if (/next|prev/i.test(label)) continue
      pages.push({ label, href: a.getAttribute('href') ?? '#', current: false })
    } else {
      const m = node.textContent?.match(/\[(\d+)\]/)
      if (m) pages.push({ label: m[1], href: '#', current: true })
    }
  }

  const topics: BoardTopic[] = []
  for (const tr of table.querySelectorAll('tbody tr')) {
    const tds = tr.querySelectorAll(':scope > td')
    if (tds.length < 6) continue
    const titleA = tds[1]?.querySelector<HTMLAnchorElement>('a.altlink_green, a[href^="/f/t/"]')
    if (!titleA) continue
    const statusSrc = tds[0]?.querySelector('img')?.getAttribute('src') ?? ''
    const authorA = tds[4]?.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const lastBy = tds[5]?.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const lastGo = tds[5]?.querySelector<HTMLAnchorElement>('a[href*="#"]')
    topics.push({
      title: txt(titleA) ?? '',
      tag: tagBefore(tds[1], titleA),
      href: titleA.getAttribute('href') ?? '#',
      sticky: !!tds[1]?.querySelector('img[alt="sticky"]'),
      locked: /\/locked/.test(statusSrc),
      hasNew: statusSrc.includes('new'),
      pages: [...tds[1].querySelectorAll<HTMLAnchorElement>('a[href*="page="]')]
        .filter((a) => /^\d+$/.test(txt(a) ?? ''))
        .map((a) => ({ label: txt(a) ?? '', href: a.getAttribute('href') ?? '#' })),
      replies: txt(tds[2]),
      views: txt(tds[3]),
      author: txt(authorA),
      authorColor: authorA?.querySelector('span')?.style.color || null,
      last: {
        at: tds[5]?.textContent?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null,
        by: txt(lastBy),
        byColor: lastBy?.querySelector('span')?.style.color || null,
        href: lastGo?.getAttribute('href') ?? null,
      },
    })
  }

  // Rebuild the per-topic page links once the table as a whole reveals the page
  // size; MAM's own links stand when it stays unknown. A long thread lists only
  // its first four pages plus its last four, so the count is the highest label
  // rather than how many links there are.
  const lastPage = (t: BoardTopic) => t.pages.reduce((max, p) => Math.max(max, Number(p.label) || 0), 0)
  const perPage = postsPerPage(topics.map((t) => ({ replies: n(t.replies) ?? 0, pages: lastPage(t) })))
  if (perPage) {
    for (const t of topics) {
      const id = t.href.match(/\/f\/t\/(\d+)/)?.[1]
      const replies = n(t.replies)
      if (!id || replies == null) continue
      const count = Math.ceil((replies + 1) / perPage)
      t.pages = count > 1 ? Array.from({ length: count }, (_, i) => ({ label: String(i + 1), href: `/f/t/${id}&page=${i + 1}` })) : []
    }
  }

  return { crumbs, actions, pages, topics }
}

export interface TopicPost {
  pid: string
  permalink: string
  author: { name: string; href: string } | null
  authorTitle: string | null
  at: string | null
  rel: string | null
  avatar: string | null
  rankImg: string | null
  klass: string | null
  stats: { posts: string | null; ratio: string | null; ul: string | null; dl: string | null }
  bodyHtml: string
  sigHtml: string | null
  edited: string | null
  pmHref: string | null
  reportHref: string | null
  editHref: string | null
}

export interface PollResult {
  label: string
  percent: number
  /** MAM marks the reader's own choice with a trailing asterisk. */
  mine: boolean
}

export interface TopicPoll {
  question: string
  /** The ballot, on a poll this reader can still vote in. */
  options: { value: string; label: string }[]
  /** The standings, once a vote has been cast. */
  results: PollResult[] | null
  votes: string | null
  /** MAM's own form, so a vote posts what its own page would post. */
  form: HTMLFormElement | null
  /** The block as served, for a shape that is neither of the two above. */
  html: string | null
}

export interface TopicData {
  crumbs: { name: string; href: string | null }[]
  title: string
  pages: { label: string; href: string; current: boolean }[]
  prevHref: string | null
  nextHref: string | null
  poll: TopicPoll | null
  posts: TopicPost[]
  topicId: string | null
  quickReply: boolean
}

/** An option's text sits loose after its radio, up to the next line break. The
 * block tags end it too, so a missing break cannot drag the Vote button in. */
function labelAfter(input: Element): string {
  let out = ''
  for (let node = input.nextSibling; node; node = node.nextSibling) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('br, input, p, div, table, hr')) break
    out += node.textContent ?? ''
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** The standings MAM draws once a vote is in: a row per option, with the share
 * as a stretched bar image beside it. Only the percentage carries the number,
 * so the bars are left behind and we draw our own. */
function pollResults(body: Element): PollResult[] | null {
  const out: PollResult[] = []
  for (const tr of body.querySelectorAll('table tr')) {
    const tds = [...tr.querySelectorAll(':scope > td')]
    if (tds.length < 2) continue
    const share = txt(tds[1])?.match(/(\d+(?:\.\d+)?)\s*%/)
    if (!share) continue
    const label = txt(tds[0]) ?? ''
    out.push({ label: label.replace(/\s*\*$/, ''), percent: Number(share[1]), mine: /\s\*$/.test(label) })
  }
  return out.length ? out : null
}

/** The poll MAM serves above the posts, as its own block headed by an h2. The
 * path is spelled out because a member can write these same tags in a post,
 * where they never sit this shallow. */
function extractPoll(main: Element): TopicPoll | null {
  const body = [...main.querySelectorAll(':scope > .blockCon > .blockBody > .blockBodyCon')].find(
    (b) => b.querySelector(':scope > h2')?.textContent?.trim().toLowerCase() === 'poll'
  )
  if (!body) return null
  const form = body.querySelector('form')
  const options = [...(form?.querySelectorAll<HTMLInputElement>('input[type="radio"][name="choice"]') ?? [])].map(
    (r) => ({ value: r.value, label: labelAfter(r) })
  )
  const results = options.length ? null : pollResults(body)
  // The heading plus the question render on their own, so the kept HTML is what
  // is left of the block. It only reaches the page when neither shape was read.
  const rest = body.cloneNode(true) as HTMLElement
  rest.querySelector(':scope > h2')?.remove()
  rest.querySelector(':scope > div[align="center"]')?.remove()
  return {
    question: txt(body.querySelector(':scope > div[align="center"]')) ?? '',
    options,
    results,
    votes: [...body.querySelectorAll('p')]
      .map((p) => txt(p))
      .find((t) => /votes:/i.test(t ?? ''))
      ?.match(/([\d,]+)/)?.[1] ?? null,
    form,
    html: options.length || results ? null : cleanHtml(rest),
  }
}

export function extractTopic(doc: Document): TopicData | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const anchors = [...main.querySelectorAll(':scope a[name]')].filter((a) => /^\d+$/.test(a.getAttribute('name') ?? ''))
  if (anchors.length === 0) return null

  const crumbs: TopicData['crumbs'] = []
  const h1 = main.querySelector('h1')
  let title = ''
  for (const node of h1?.childNodes ?? []) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('a')) {
      crumbs.push({ name: txt(node as Element) ?? '', href: (node as Element).getAttribute('href') })
    } else {
      const t = node.textContent?.replace(/^[>\s]+|[>\s]+$/g, '') ?? ''
      if (t) title = t
    }
  }

  const pages: TopicData['pages'] = []
  let prevHref: string | null = null
  let nextHref: string | null = null
  // A topic with a poll opens with the poll's own centered paragraph, the one
  // holding its Vote button, so take the first that actually carries page links.
  for (const bar of main.querySelectorAll('p[align="center"]')) {
    const found: TopicData['pages'] = []
    let prev: string | null = null
    let next: string | null = null
    // The page you are on is a <b>[N]</b> between the links, so read the nodes in
    // order to keep it in its place.
    for (const node of bar.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('a')) {
        const a = node as HTMLAnchorElement
        const label = txt(a) ?? ''
        const href = a.getAttribute('href') ?? '#'
        if (/next/i.test(label)) next = href
        else if (/prev/i.test(label)) prev = href
        else if (/^\d+$/.test(label)) found.push({ label, href, current: false })
      } else {
        const m = node.textContent?.match(/\[(\d+)\]/)
        if (m) found.push({ label: m[1], href: '#', current: true })
      }
    }
    if (found.length || prev || next) {
      pages.push(...found)
      prevHref = prev
      nextHref = next
      break
    }
  }

  const posts: TopicPost[] = []
  for (const anchor of anchors) {
    const pid = anchor.getAttribute('name')!
    // MAM inserts <a name="last"> before the last post's table, so the body table
    // is not always the immediate sibling; walk past non-post nodes to reach it,
    // but stop at the next numeric post anchor so we never grab another post's table.
    let table: Element | null = anchor.nextElementSibling
    while (table && !table.matches('table.coltable')) {
      if (table.matches('a[name]') && /^\d+$/.test(table.getAttribute('name') ?? '')) { table = null; break }
      table = table.nextElementSibling
    }
    if (!table) continue
    const header = table.querySelector('[data-pid]')
    const headText = header?.textContent ?? ''
    const authorA = header?.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const avatarBox = table.querySelector('.forumAviBox')
    const bodyTd = table.querySelector<HTMLElement>(`#postID${pid}`)
    const sig = bodyTd?.querySelector('.forumSig')
    const editedEl = bodyTd?.querySelector('.small')
    // Body without sig/edited-note (they render separately); clone stays
    // detached - no re-parse, cleanHtml strips active content.
    let bodyHtml = ''
    if (bodyTd) {
      const clone = bodyTd.cloneNode(true) as HTMLElement
      clone.querySelector('.forumSig')?.remove()
      clone.querySelectorAll(':scope > .small').forEach((e) => e.remove())
      bodyHtml = cleanHtml(clone) ?? ''
    }
    const avStats = avatarBox?.textContent ?? ''
    posts.push({
      pid,
      permalink: header?.querySelector('a.postLinkBack')?.getAttribute('href') ?? `#${pid}`,
      author: authorA ? { name: txt(authorA) ?? '', href: authorA.getAttribute('href') ?? '#' } : null,
      authorTitle: headText.match(/\(([^)]*)\)\s+at /)?.[1] ?? null,
      at: headText.match(/at\s+([\d-]+ [\d:]+)\s*UTC/)?.[1] ?? null,
      rel: headText.match(/\(([^)]+ ago)\)/)?.[1] ?? null,
      avatar: avatarBox?.querySelector('img.avatar')?.getAttribute('src') ?? null,
      rankImg: avatarBox?.querySelector('img[src*="ranks"]')?.getAttribute('src') ?? null,
      klass: avStats.match(/^\s*([A-Za-z /]+?)\s*Posts:/)?.[1]?.trim() ?? null,
      stats: {
        posts: avStats.match(/Posts:\s*([\d,]+)/)?.[1] ?? null,
        ratio: avStats.match(/Ratio:\s*([\d,.]+|--|∞)/)?.[1] ?? null,
        ul: avStats.match(/UL:\s*([\d.,]+\s*\S+)/)?.[1] ?? null,
        dl: avStats.match(/DL:\s*([\d.,]+\s*\S+)/)?.[1] ?? null,
      },
      bodyHtml,
      sigHtml: cleanHtml(sig),
      edited: txt(editedEl),
      pmHref: table.querySelector<HTMLAnchorElement>('a[href*="sendmessage.php"]')?.getAttribute('href') ?? null,
      reportHref: table.querySelector<HTMLAnchorElement>('a[href*="newTicket"]')?.getAttribute('href') ?? null,
      // MAM adds this edit link only on the viewer's own posts and for staff.
      editHref: table.querySelector<HTMLAnchorElement>('a[href*="action=editpost"]')?.getAttribute('href') ?? null,
    })
  }

  return {
    crumbs,
    title,
    pages,
    prevHref,
    nextHref,
    poll: extractPoll(main),
    posts,
    topicId: doc.querySelector('input[name="topicid"], input[name="topic_id"]')?.getAttribute('value') ?? null,
    quickReply: !!doc.querySelector('#quickReply form[action="/forums.php"], form[name="compose"]'),
  }
}

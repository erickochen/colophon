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
  sig: string | null
  edited: string | null
  pmHref: string | null
  reportHref: string | null
  editHref: string | null
}

export interface TopicData {
  crumbs: { name: string; href: string | null }[]
  title: string
  pages: { label: string; href: string; current: boolean }[]
  prevHref: string | null
  nextHref: string | null
  posts: TopicPost[]
  topicId: string | null
  quickReply: boolean
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
  const pageP = main.querySelector('p[align="center"], p[align=\'center\']')
  for (const a of pageP?.querySelectorAll('a') ?? []) {
    const label = txt(a) ?? ''
    const href = a.getAttribute('href') ?? '#'
    if (/next/i.test(label)) nextHref = href
    else if (/prev/i.test(label)) prevHref = href
    else if (/^\d+$/.test(label)) pages.push({ label, href, current: false })
  }
  const cur = pageP?.textContent?.match(/\[(\d+)\]/)
  if (cur) pages.unshift({ label: cur[1], href: '#', current: true })

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
      sig: txt(sig),
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
    posts,
    topicId: doc.querySelector('input[name="topicid"], input[name="topic_id"]')?.getAttribute('value') ?? null,
    quickReply: !!doc.querySelector('#quickReply form[action="/forums.php"], form[name="compose"]'),
  }
}

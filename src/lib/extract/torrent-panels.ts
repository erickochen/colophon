// The two fragments the detail page loads over AJAX: the file list and the peer
// list. Both arrive as a whole HTML document, so they are parsed here and drawn
// as our own tables instead of being injected as markup.

export interface TorrentFile {
  /** Folder the file sits in, empty for a flat torrent. */
  path: string
  name: string
  size: string
}

export interface FileListData {
  hash: string | null
  /** Name the torrent carries. It is the folder a client makes, except on a
   * single-file torrent that brings no folder, where it is the file itself. */
  name: string | null
  files: TorrentFile[]
}

/** MAM marks a peer with one of three classes, so "not connectable" and
 * "offline" stay apart. */
export type Reachability = 'connectable' | 'unconnectable' | 'offline' | null

export interface PeerRow {
  client: string
  /** null when the row carries no marker at all. */
  reach: Reachability
  /** MAM's own wording for that marker, for the label. */
  reachLabel: string | null
  connectedFor: string
  connectedAt: string | null
  lastAnnounce: string
  lastAnnounceAt: string | null
  nextAnnounce: string
}

export interface PeerData {
  seeding: PeerRow[]
  leeching: PeerRow[]
}

/** Names arrive with non-breaking spaces so they never wrap in MAM's table. */
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

// The hash heading runs straight into the next line of text, so the label is
// the anchor rather than a word boundary.
const HASH_PATTERN = /hash:\s*([0-9a-f]{40})/i

// The torrent name sits in a bare text node between the hash heading and the
// table, so it is read from the nodes before that table rather than from the
// whole body text, which would drag the rows in with it.
const NAME_PATTERN = /torrent\s*title:\s*(.+)/i

function readName(doc: Document, table: Element): string | null {
  for (const node of doc.body?.childNodes ?? []) {
    if (node === table || (node instanceof Element && node.contains(table))) break
    if (node.nodeType !== Node.TEXT_NODE) continue
    const found = NAME_PATTERN.exec(node.textContent ?? '')
    if (found) return found[1].replace(/\s+/g, ' ').trim() || null
  }
  return null
}

/** A served error page or a login wall answers 200 with its own tables, so the
 * fragment has to name itself before its rows are read as files. */
export function parseFileList(doc: Document): FileListData {
  const table = doc.querySelector('#fileListTable')
  if (!table) throw new Error('unknown file list fragment')
  const files: TorrentFile[] = []
  for (const row of table.querySelectorAll('tbody tr')) {
    const cells = row.querySelectorAll('td')
    if (cells.length < 2) continue
    const name = text(cells[1])
    if (!name) continue
    files.push({ path: text(cells[0]), name, size: text(cells[2]) })
  }
  const hash = doc.body?.textContent?.match(HASH_PATTERN)?.[1] ?? null
  return { hash: hash?.toUpperCase() ?? null, name: readName(doc, table), files }
}

const REACH: Reachability[] = ['connectable', 'unconnectable', 'offline']

function peerRows(container: Element | null): PeerRow[] {
  const out: PeerRow[] = []
  for (const row of container?.querySelectorAll('tbody tr') ?? []) {
    const cells = row.querySelectorAll('td')
    if (cells.length < 5) continue
    const marker = cells[3].querySelector('img')
    out.push({
      lastAnnounce: text(cells[0]),
      lastAnnounceAt: cells[0].querySelector('span')?.getAttribute('title') ?? null,
      nextAnnounce: text(cells[1]),
      connectedFor: text(cells[2]),
      connectedAt: cells[2].querySelector('span')?.getAttribute('title') ?? null,
      reach: REACH.find((r) => r && marker?.classList.contains(r)) ?? null,
      reachLabel: marker?.getAttribute('title') || marker?.getAttribute('alt') || null,
      client: text(cells[4]),
    })
  }
  return out
}

export function parsePeers(doc: Document): PeerData {
  // Each side falls back on its own, so a renamed id cannot turn the other list
  // into a confident "nobody". The fallback only takes tables that carry the
  // peer heading, so a served error page stays an error instead of an empty
  // list.
  const tables = [...doc.querySelectorAll('table')].filter((t) => /agent/i.test(t.querySelector('thead')?.textContent ?? ''))
  const seeding = doc.querySelector('#seeders') ?? tables[0] ?? null
  const leeching = doc.querySelector('#leeches') ?? doc.querySelector('#leechers') ?? tables[1] ?? null
  if (!seeding && !leeching) throw new Error('unknown peers fragment')
  return { seeding: peerRows(seeding), leeching: peerRows(leeching) }
}

// Member lookup through /users.php, which answers a plain fetch. Used by the
// member list page plus anywhere that needs to pick someone by name.

export interface UserRow {
  name: string
  href: string
  uid: string | null
  registered: string
  lastAccess: string
  className: string
  country: string | null
  flag: string | null
}

/** Rows MAM serves per member-list page, so a full page means there are more. */
export const MEMBER_PAGE_SIZE = 100

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

/** MAM links profiles two ways: the short /u/<id> and userdetails.php?id=<id>.
 * The member list uses the long one. */
export function profileUid(href: string | null | undefined): string | null {
  if (!href) return null
  return href.match(/\/u\/(\d+)/)?.[1] ?? href.match(/[?&]id=(\d+)/)?.[1] ?? null
}

export function parseUsers(html: string): UserRow[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('#mainBody table')
  if (!table) return []
  const out: UserRow[] = []
  for (const tr of table.querySelectorAll('tr')) {
    const tds = [...tr.querySelectorAll('td')]
    const a = tds[0]?.querySelector('a')
    if (!a || tds.length < 5) continue // header or malformed row
    const href = a.getAttribute('href') ?? '#'
    const flagImg = tds[4]?.querySelector('img')
    out.push({
      name: clean(a.textContent),
      href,
      uid: profileUid(href),
      registered: clean(tds[1]?.textContent),
      lastAccess: clean(tds[2]?.textContent),
      className: clean(tds[3]?.textContent),
      country: flagImg?.getAttribute('title') ?? null,
      flag: flagImg?.getAttribute('src') ?? null,
    })
  }
  return out
}

/** Searches the membership by name, with an optional class filter. */
export async function searchMembers(term: string, klass = ''): Promise<UserRow[]> {
  const params = new URLSearchParams({ search: term.trim(), class: klass })
  const res = await fetch(`/users.php?${params.toString()}`, { credentials: 'same-origin' })
  if (!res.ok) return []
  return parseUsers(await res.text())
}

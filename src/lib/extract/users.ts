import { mamFetch } from '@/lib/mam-fetch'

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

export function parseUsers(doc: Document): UserRow[] {
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

export interface ClassOption { value: string; label: string }

/** The class dropdown as MAM serves it on the member list. Its catch-all reads
 * "(any class)" there; on a bar of plain controls it reads as a value like the
 * rest. */
export function parseClasses(doc: Document): ClassOption[] {
  const opts = [...doc.querySelectorAll<HTMLOptionElement>('#mainBody select[name="class"] option')]
  return opts.map((o) => ({ value: o.value || '-', label: o.value === '-' ? 'Any class' : clean(o.textContent) }))
}

export interface MemberPage {
  rows: UserRow[]
  /** Empty when the page carried no form to read them from. */
  classes: ClassOption[]
}

/** Searches the membership by name, with an optional class filter. Answers the
 * class options too, since a page reached from elsewhere has no form of its
 * own to read them from. */
export async function searchMemberPage(term: string, klass = ''): Promise<MemberPage> {
  const params = new URLSearchParams({ search: term.trim(), class: klass })
  const res = await mamFetch(`/users.php?${params.toString()}`, { credentials: 'same-origin' })
  // Thrown rather than answered empty, so a failing list reads as a failure
  // instead of a membership with nobody in it.
  if (!res.ok) throw new Error(`users.php answered ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  return { rows: parseUsers(doc), classes: parseClasses(doc) }
}

/** Searches the membership by name, with an optional class filter. */
export async function searchMembers(term: string, klass = ''): Promise<UserRow[]> {
  return (await searchMemberPage(term, klass)).rows
}

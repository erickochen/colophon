import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { BookOpen, Gift, Library, Loader2, MessagesSquare, Mic, Search, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import { searchTorrents, parsePeople, requestsUrl, search2Url, type SearchQuery, type SearchTorrent } from '@/lib/mam-api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'

/** Shorter than this a search matches most of the library, so the menu waits.
 * The member picker holds the same floor. */
const MIN_TERM = 2

/** What the live results read. MAM offers author, narrator plus series in its
 * own autocomplete, so a name typed here finds a book on any of the three. */
const SUGGEST_FIELDS: NonNullable<SearchQuery['srchIn']> = ['title', 'author', 'narrator', 'series']

interface Scope {
  key: string
  icon: LucideIcon
  /** Reads as "<label> <term>". */
  label: string
  href: (term: string) => string
}

/** One search with a different field each. Title plus author is what a search
 * reads when nobody picks anything else, so it stands for all torrents. */
const CATALOG_SCOPES: Scope[] = [
  { key: 'tor', icon: Search, label: 'All torrents for', href: (t) => search2Url({ text: t, srchIn: ['title', 'author'] }) },
  { key: 'author', icon: UserRound, label: 'Authors matching', href: (t) => search2Url({ text: t, srchIn: ['author'] }) },
  { key: 'narrator', icon: Mic, label: 'Narrators matching', href: (t) => search2Url({ text: t, srchIn: ['narrator'] }) },
  { key: 'series', icon: Library, label: 'Series matching', href: (t) => search2Url({ text: t, srchIn: ['series'] }) },
]

/** Three other places. The member scope is MAM's own: an exact name lands on
 * that profile, anything else on the member list. */
const ELSEWHERE_SCOPES: Scope[] = [
  { key: 'forum', icon: MessagesSquare, label: 'Forum posts about', href: (t) => `/f/s?text=${encodeURIComponent(t)}` },
  { key: 'req', icon: Gift, label: 'Requests for', href: (t) => requestsUrl({ text: t }) },
  { key: 'user', icon: UsersRound, label: 'Members named', href: (t) => `/n_a/userQuickSearch.php?action=search&SEARCH=${encodeURIComponent(t)}` },
]

const NAV = [
  { title: 'Dashboard', href: '/' },
  { title: 'Browse torrents', href: '/tor/search.php' },
  { title: 'Freeleech picks', href: '/freeleech.php' },
  { title: 'Top 10', href: '/stats/top10Tor.php' },
  { title: 'Requests', href: requestsUrl() },
  { title: 'My requests', href: requestsUrl({ filled: 'either', requester: 'me' }) },
  { title: 'Forum', href: '/f' },
  { title: 'Messages', href: '/messages.php?action=viewmailbox' },
  { title: 'Store', href: '/store.php' },
  { title: 'Preferences', href: '/preferences/index.php' },
]

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchTorrent[]>([])
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_TERM) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await searchTorrents({ text: q, srchIn: SUGGEST_FIELDS, perpage: 8 })
        if (seq.current === mine) setResults(res.data)
      } catch {
        if (seq.current === mine) setResults([])
      } finally {
        if (seq.current === mine) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const term = query.trim()

  const go = (href: string) => {
    onOpenChange(false)
    window.location.assign(href)
  }

  // Typing on while results are already listed can leave the list with nothing
  // selected. Enter would then do nothing at all, so it falls back to the widest
  // search: the first row of the catalog group.
  const onEnter = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || term.length < MIN_TERM) return
    if (listRef.current?.querySelector('[aria-selected="true"]')) return
    e.preventDefault()
    go(CATALOG_SCOPES[0].href(term))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search</DialogTitle>
        <DialogDescription>Search torrents, navigate the site</DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-[20%] max-w-xl translate-y-0 overflow-hidden p-0"
        showCloseButton={false}
        // Focus the input regardless of trigger source; a mouse-open otherwise
        // lands focus on the dialog container, not the search field.
        initialFocus={inputRef}
      >
        <Command shouldFilter={false} className="**:data-[slot=command-input-wrapper]:h-13">
          <CommandInput
            ref={inputRef}
            placeholder="Search titles, authors, narrators, series…"
            value={query}
            onValueChange={setQuery}
            onKeyDown={onEnter}
          />
          {/* Enough room for the scopes under the results, while the dialog at
              20% of the viewport stays clear of the bottom edge on a short
              screen. Dynamic units so a phone toolbar cannot cover the last
              rows. */}
          <CommandList ref={listRef} className="max-h-[65dvh]">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Searching…
              </div>
            )}
            {/* A plain row, not CommandEmpty: with filtering off cmdk counts
                every item, so the scopes below keep the list from being empty. */}
            {!loading && term.length >= MIN_TERM && results.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">No torrents match “{term}”.</div>
            )}
            {results.length > 0 && (
              <CommandGroup heading="Torrents">
                {results.map((t) => {
                  const authors = parsePeople(t.author_info).map((a) => a.name).join(', ')
                  return (
                    <CommandItem key={t.id} value={`t-${t.id}`} onSelect={() => go(`/t/${t.id}`)}>
                      <BookOpen className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{t.title}</span>
                        {authors && <span className="text-muted-foreground"> · {authors}</span>}
                      </span>
                      {t.vip === 1 && <Badge variant="secondary" className="bg-brand-soft text-accent-foreground">VIP</Badge>}
                      <Badge variant="outline" className="uppercase">{t.filetype?.split(' ')[0] ?? '?'}</Badge>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {term.length >= MIN_TERM && (
              <>
                <CommandGroup heading="Search the catalog">
                  {CATALOG_SCOPES.map((s) => (
                    <CommandItem key={s.key} value={`s-${s.key}`} onSelect={() => go(s.href(term))}>
                      <s.icon />
                      {s.label}
                      <b>{term}</b>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Search elsewhere">
                  {ELSEWHERE_SCOPES.map((s) => (
                    <CommandItem key={s.key} value={`s-${s.key}`} onSelect={() => go(s.href(term))}>
                      <s.icon />
                      {s.label}
                      <b>{term}</b>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {term.length < MIN_TERM && (
              <CommandGroup heading="Go to">
                {NAV.map((n) => (
                  <CommandItem key={n.href} value={n.title} onSelect={() => go(n.href)}>
                    {n.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

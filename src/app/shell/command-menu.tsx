import { useEffect, useRef, useState } from 'react'
import { BookOpen, CornerDownLeft, Loader2, MessagesSquare, Search, UserRound, UsersRound } from 'lucide-react'
import { searchTorrents, parsePeople, requestsUrl, type SearchTorrent } from '@/lib/mam-api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'

const NAV = [
  { title: 'Dashboard', href: '/' },
  { title: 'Browse torrents', href: '/tor/browse.php' },
  { title: 'Freeleech picks', href: '/freeleech.php' },
  { title: 'Top 10', href: '/stats/top10Tor.php' },
  { title: 'Requests', href: requestsUrl() },
  { title: 'Forum', href: '/f' },
  { title: 'Messages', href: '/messages.php?action=viewmailbox' },
  { title: 'Store', href: '/store.php' },
  { title: 'Preferences', href: '/preferences/index.php' },
]

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchTorrent[]>([])
  const [loading, setLoading] = useState(false)
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
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await searchTorrents({ text: q, srchIn: ['title', 'author', 'series'], perpage: 8 })
        if (seq.current === mine) setResults(res.data)
      } catch {
        if (seq.current === mine) setResults([])
      } finally {
        if (seq.current === mine) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const enc = encodeURIComponent(query.trim())
  const go = (href: string) => {
    onOpenChange(false)
    window.location.assign(href)
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
            placeholder="Search titles, authors, series…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[420px]">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Searching…
              </div>
            )}
            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <CommandEmpty>No torrents match “{query.trim()}”.</CommandEmpty>
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
            {query.trim().length >= 2 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Search everywhere">
                  <CommandItem value="s-tor" onSelect={() => go(`/tor/browse.php?tor%5Btext%5D=${enc}&tor%5BsrchIn%5D%5Btitle%5D=true&tor%5BsrchIn%5D%5Bauthor%5D=true&action=search`)}>
                    <Search /> All torrents for <b>{query.trim()}</b> <CornerDownLeft className="ml-auto size-3.5 text-muted-foreground" />
                  </CommandItem>
                  <CommandItem value="s-author" onSelect={() => go(`/tor/browse.php?tor%5Btext%5D=${enc}&tor%5BsrchIn%5D%5Bauthor%5D=true&action=search`)}>
                    <UserRound /> Authors matching <b>{query.trim()}</b>
                  </CommandItem>
                  <CommandItem value="s-forum" onSelect={() => go(`/f/s?text=${enc}`)}>
                    <MessagesSquare /> Forum posts about <b>{query.trim()}</b>
                  </CommandItem>
                  <CommandItem value="s-req" onSelect={() => go(requestsUrl({ text: query.trim() }))}>
                    <UsersRound /> Requests for <b>{query.trim()}</b>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
            {query.trim().length < 2 && (
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

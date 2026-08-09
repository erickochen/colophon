// External search links plus the currently-reading snippet on torrent detail.
// The snippet output matches MAM+ so existing forum threads look consistent.
import { useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { TorrentDetail } from '@/lib/extract/torrent'
import { useFeature } from '@/lib/settings'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

// MAM+ caps the author list of the snippet at three names plus an "etc.".
const SNIPPET_AUTHOR_MAX = 3
// How long the copy button shows its checkmark.
const COPIED_FLASH_MS = 2000

const SITE_ORIGIN = 'https://www.myanonamouse.net'

function searchTargets(title: string, author: string | null): { label: string; href: string }[] {
  const both = author ? `${title} ${author}` : title
  return [
    {
      label: 'Goodreads',
      href: `https://www.goodreads.com/search?q=${encodeURIComponent(both.replace('%', ''))}&search_type=books&search%5Bfield%5D=on`,
    },
    {
      label: 'Audible',
      href: `https://www.audible.com/search?title=${encodeURIComponent(title)}${author ? `&author_author=${encodeURIComponent(author)}` : ''}`,
    },
    {
      label: 'StoryGraph',
      href: `https://app.thestorygraph.com/browse?search_term=${encodeURIComponent(both)}`,
    },
  ]
}

/** "[url=/t/id]Title[/url] by [i][url=..]Author[/url][/i]", the MAM+ shape. */
export function buildReadingSnippet(data: TorrentDetail): string | null {
  if (data.id == null || !data.title) return null
  let authors = data.authors.map((a) => `[url=${a.href.replace(SITE_ORIGIN, '')}]${a.name}[/url]`)
  if (authors.length > SNIPPET_AUTHOR_MAX) authors = [...authors.slice(0, SNIPPET_AUTHOR_MAX), 'etc.']
  return `[url=/t/${data.id}]${data.title}[/url] by [i]${authors.join(', ')}[/i]`
}

const LINK_CLS = 'transition-colors hover:text-brand hover:underline'

export function TorLinks({ data }: { data: TorrentDetail }) {
  const [linksOn] = useFeature('externalLinks')
  const [snippetOn] = useFeature('forumSnippet')
  const [copied, setCopied] = useState(false)
  const flashTimer = useRef<number | null>(null)

  if (!data.title) return null
  const snippet = snippetOn ? buildReadingSnippet(data) : null
  const links = linksOn ? searchTargets(data.title, data.authors[0]?.name ?? null) : []
  if (links.length === 0 && !snippet) return null

  async function copySnippet() {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      toast.success('Snippet copied', { description: 'Paste it in a forum post or your profile.' })
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    } catch {
      toast.error('Copying did not go through.')
    }
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted-foreground">
      {links.length > 0 && (
        <>
          <span className="text-muted-foreground/70">Find on</span>
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
              {l.label}
            </a>
          ))}
        </>
      )}
      {snippet && (
        <>
          {links.length > 0 && <span aria-hidden="true" className="text-muted-foreground/50">·</span>}
          <button
            type="button"
            onClick={copySnippet}
            className={cn('inline-flex items-center gap-1', LINK_CLS, copied && 'text-ok hover:text-ok')}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy forum snippet'}
          </button>
        </>
      )}
    </div>
  )
}

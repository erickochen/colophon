// External search links plus the currently-reading snippet on torrent detail.
// The snippet output matches MAM+ so existing forum threads look consistent.
import type { TorrentDetail } from '@/lib/extract/torrent'
import { useFeature } from '@/lib/settings'
import { toast } from '@/components/ui/toast'

// MAM+ caps the author list of the snippet at three names plus an "etc.".
const SNIPPET_AUTHOR_MAX = 3

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

const LINK_CLS =
  'rounded-sm transition-colors hover:text-brand hover:underline focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none'

/** The search row itself, as bare flex children so the caller owns the row.
 * Used by torrent detail and by a request page, which have no shape in common
 * beyond a title and an author. */
export function ExternalSearchLinks({ title, author }: { title: string; author: string | null }) {
  return (
    <>
      <span className="text-muted-foreground">Find on</span>
      {searchTargets(title, author).map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
          {l.label}
        </a>
      ))}
    </>
  )
}

export function TorLinks({ data }: { data: TorrentDetail }) {
  const [linksOn] = useFeature('externalLinks')
  if (!linksOn || !data.title) return null
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted-foreground">
      <ExternalSearchLinks title={data.title} author={data.authors[0]?.name ?? null} />
    </div>
  )
}

/** Copying the snippet acts on this torrent, so it rides with the download
 * routes rather than with the links that lead off site. Null when the feature
 * is off, which lets the caller drop the entry. */
export function useReadingSnippet(data: TorrentDetail): (() => Promise<void>) | null {
  const [snippetOn] = useFeature('forumSnippet')
  const snippet = snippetOn ? buildReadingSnippet(data) : null
  if (!snippet) return null
  return async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      toast.success('Snippet copied', { description: 'Paste it in a forum post or your profile.' })
    } catch {
      toast.error('Copying did not go through.')
    }
  }
}

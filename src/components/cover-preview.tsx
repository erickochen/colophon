import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { RichHtml } from '@/app/shell/bits'
import { bbToHtml } from '@/components/bb-composer'
import { Book, BookAmbilight } from '@/components/book'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { Skeleton } from '@/components/ui/skeleton'
import { coverShape } from '@/lib/cover-shape'
import { parsePeople, type SearchTorrent } from '@/lib/mam-api'
import { knownDescription, torrentDescription } from '@/lib/torrent-description'
import { cn } from '@/lib/utils'

// Long enough that running the pointer down a list opens nothing.
const OPEN_DELAY_MS = 250
const CLOSE_DELAY_MS = 100
// A comfortable measure for a blurb: around 55 characters a line at this size.
const CARD_WIDTH_PX = 400
// On a window too narrow for that, the card gives way rather than running off
// the side.
const CARD_MARGIN_PX = 32
// The cover beside the heading, small enough to leave the blurb its width.
const CARD_COVER_PX = 84
// Same glass as the hero on a torrent page.
const GLASS_LAYERS = 6
const GLASS_BLUR_STEP_PX = 6

// The card ground: a pocket of the cover's own light around the book, thickening
// into a surface the heading plus the blurb can be read on.
const VEIL =
  'radial-gradient(120% 120% at 7% 0%, transparent 0%, color-mix(in oklab, var(--card) 55%, transparent) 22%, color-mix(in oklab, var(--card) 92%, transparent) 52%, color-mix(in oklab, var(--card) 97%, transparent) 100%)'
// Runs the last lines out where there is more text than room.
const CLIP_FADE = 'linear-gradient(180deg,#000 0%,#000 76%,transparent 100%)'

// Uploaders pad their blurbs with blank paragraphs. In a card this size those
// gaps cost more than they give, so they come out before the text is measured.
const BLANK_BLOCK = /<(p|div)>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/\1>/gi

/** Whether a blurb still says anything once the markup is taken out. Pictures
 * are left out of the card, so a blurb made of nothing but images reads as
 * empty here and points at the page instead. */
function hasWords(html: string): boolean {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim().length > 0
}

function prepare(raw: string): string {
  return raw ? bbToHtml(raw).replace(BLANK_BLOCK, '') : ''
}

function Blurb({ t, withCover, poster }: { t: SearchTorrent; withCover: boolean; poster: string | null }) {
  const [html, setHtml] = useState<string | null>(() => {
    const kept = knownDescription(t.id)
    return kept == null ? null : prepare(kept)
  })
  const [failed, setFailed] = useState(false)
  const [clipped, setClipped] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const authors = parsePeople(t.author_info)
    .map((a) => a.name)
    .join(', ')

  useEffect(() => {
    let alive = true
    torrentDescription(t.id)
      .then((raw) => {
        if (alive) setHtml(prepare(raw))
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [t.id])

  // Only clip what actually runs over, so a short blurb keeps its last line.
  // Measured before the paint, so the fade arrives with the text.
  useLayoutEffect(() => {
    const el = body.current
    if (el) setClipped(el.scrollHeight > el.clientHeight + 1)
  }, [html])

  return (
    <div className="relative overflow-hidden rounded-xl bg-card shadow-book-lift">
      <BookAmbilight poster={poster} />
      {poster && (
        <>
          <ProgressiveBlur
            direction="bottom"
            blurLayers={GLASS_LAYERS}
            blurIntensity={GLASS_BLUR_STEP_PX}
            className="pointer-events-none absolute inset-0 z-1"
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-1" style={{ background: VEIL }} />
        </>
      )}

      <div className="relative z-2 p-4">
        <div className="flex items-start gap-3">
          {withCover && poster && (
            <span className="shrink-0" style={{ width: `${CARD_COVER_PX}px` }}>
              <Book
                poster={poster}
                title={t.title}
                shape={coverShape({ mediatype: t.mediatype, mainCat: t.main_cat })}
                size="row"
                className="rounded-[3px_5px_5px_3px] shadow-book-lift"
              />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="font-display block text-[14.5px] font-medium leading-[1.3]">{t.title}</span>
            {authors && <span className="mt-1 block text-[11.5px] leading-snug text-muted-foreground">{authors}</span>}
          </span>
        </div>

        <div
          ref={body}
          className={cn(
            'mt-3 max-h-52 overflow-hidden text-[12.5px] leading-[1.6]',
            // A picture in a card this size is noise. A dead one from the image
            // gateway is worse. The page carries the whole blurb.
            '[&_img]:hidden [&_table]:text-[11.5px]'
          )}
          style={clipped ? { maskImage: CLIP_FADE, WebkitMaskImage: CLIP_FADE } : undefined}
        >
          {failed ? (
            <p className="text-muted-foreground">The description did not load.</p>
          ) : html == null ? (
            <div className="grid gap-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[92%]" />
              <Skeleton className="h-3 w-[74%]" />
            </div>
          ) : !hasWords(html) ? (
            <p className="text-muted-foreground">No description.</p>
          ) : (
            <RichHtml html={html} />
          )}
        </div>
      </div>
    </div>
  )
}

/** Wraps a cover so hovering it shows the book: the art large, lit by its own
 * color, with the blurb underneath. The blurb is fetched on the first open, so a
 * list of covers costs nothing until one is asked about. */
export function CoverPreview({
  t,
  poster,
  withCover = true,
  enabled,
  children,
}: {
  t: SearchTorrent
  poster: string | null
  /** Off where the cover on the page is already large, as in the gallery. */
  withCover?: boolean
  /** Read once per list by the caller, rather than per row. */
  enabled: boolean
  children: ReactNode
}) {
  const [opened, setOpened] = useState(false)

  if (!enabled) return <>{children}</>

  return (
    <HoverCard
      onOpenChange={(open) => {
        if (open) setOpened(true)
      }}
    >
      <HoverCardTrigger asChild delay={OPEN_DELAY_MS} closeDelay={CLOSE_DELAY_MS}>
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={16}
        alignOffset={-8}
        className="rounded-xl border-0 bg-transparent p-0 shadow-none"
        style={{ width: `min(${CARD_WIDTH_PX}px, calc(100vw - ${CARD_MARGIN_PX}px))` }}
      >
        {opened && <Blurb t={t} withCover={withCover} poster={poster} />}
      </HoverCardContent>
    </HoverCard>
  )
}

// Small shared page components (Reading Room voice).
import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ProtocolStatus } from '@/lib/extract/shell'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination'
import { mutedUserColor } from '@/lib/colors'
import { rewriteHiddenBlocks, toggleSpoiler } from '@/lib/hidden-text'
import { getPortalContainer } from '@/lib/portals'
import { onThemeSide } from '@/lib/theme-paint'
import { tameHtml } from '@/lib/user-html'
import { cn } from '@/lib/utils'

export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-balance">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** One word for a protocol's connectability, for places too tight for a sentence. */
export function protocolWord(p: ProtocolStatus): string {
  return p.connectable == null ? 'unknown' : p.connectable ? 'connectable' : 'offline'
}

/** MAM's own label for the state, which says it is the torrent client being described. */
export function protocolNote(p: ProtocolStatus): string {
  return p.note ?? protocolWord(p)
}

export function Crumbs({ items }: { items: { name: string; href: string | null }[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="text-[12.5px]">
        {items.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {c.href ? (
                <BreadcrumbLink href={c.href}>{c.name}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{c.name}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function UserLink({ name, href, color, exactColor, className }: { name: string | null; href?: string | null; color?: string | null; exactColor?: string | null; className?: string }) {
  if (!name) return null
  // exactColor skips the muting map, for tints that are already theme-tuned.
  const style = exactColor ? { color: exactColor } : color ? { color: mutedUserColor(color) } : undefined
  return href ? (
    <a href={href} className={cn('font-medium hover:underline', className)} style={style}>{name}</a>
  ) : (
    <span className={cn('font-medium', className)} style={style}>{name}</span>
  )
}

export function Pager({
  pages,
  prevHref,
  nextHref,
  className,
}: {
  pages: { label: string; href: string; current?: boolean }[]
  prevHref?: string | null
  nextHref?: string | null
  className?: string
}) {
  if (pages.length <= 1 && !prevHref && !nextHref) return null
  return (
    <Pagination className={cn('mx-0 w-auto justify-start', className)}>
      <PaginationContent>
        {prevHref && (
          <PaginationItem>
            <PaginationPrevious href={prevHref} />
          </PaginationItem>
        )}
        {pages.map((p, i) => {
          const prev = pages[i - 1]
          const gap = prev && /^\d+$/.test(prev.label) && /^\d+$/.test(p.label) && Number(p.label) - Number(prev.label) > 1
          return (
            <Fragment key={i}>
              {gap && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              <PaginationItem>
                {/* Some lists number their pages by the range they hold ("26 - 50"),
                    which runs out of a square button. */}
                <PaginationLink href={p.href} isActive={p.current} size={/^\d+$/.test(p.label) ? 'icon' : 'default'}>
                  {p.label}
                </PaginationLink>
              </PaginationItem>
            </Fragment>
          )
        })}
        {nextHref && (
          <PaginationItem>
            <PaginationNext href={nextHref} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  )
}

/* MAM quotes are <div class="quote"><span>… wrote:</span>…</div>. Card-in-card:
 * a hairline border around every quote and fills that alternate per depth, so
 * nesting reads at a glance. The serif quote mark lives in index.css. Shared
 * with the composer so writing matches posting. */
export const QUOTE_CLASSES =
  '[&_.quote]:my-3 [&_.quote]:rounded-md [&_.quote]:border [&_.quote]:bg-muted [&_.quote]:py-2.5 [&_.quote]:pr-3.5 [&_.quote]:pl-4 [&_.quote]:text-[13px] [&_.quote_.quote]:bg-card [&_.quote_.quote_.quote]:bg-muted [&_.quote>span:first-child]:mb-1.5 [&_.quote>span:first-child]:block [&_.quote>span:first-child]:text-[11.5px] [&_.quote>span:first-child]:font-semibold [&_.quote>span:first-child]:text-foreground [&_.quote_p:last-child]:mb-0'

/* MAM's editor writes every line as its own <p> and renders <p> without
 * margins, so blank lines only come from explicitly empty paragraphs. Post
 * bodies match that; RichHtml's default paragraph gap would double-space them. */
export const POST_SPACING = 'leading-normal [&_p]:my-0'

/** Quoted bodies carry editor padding at the box edges: blank <br> runs and
 * whitespace-only lines. Trim the edges and cap inner gaps at one blank line
 * so quote boxes stay tight. Word-separating spaces are left alone. */
function tidyQuotes(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  const isBr = (n: ChildNode) => n instanceof HTMLElement && n.tagName === 'BR'
  const isPad = (n: ChildNode) => n.nodeType === Node.TEXT_NODE && !/\S/.test(n.nodeValue ?? '')
  const isGap = (n: ChildNode) => isBr(n) || isPad(n)
  for (const quote of body.querySelectorAll('div.quote')) {
    const kids = [...quote.childNodes]
    let i = 0
    while (i < kids.length && isGap(kids[i])) kids[i++].remove()
    const head = kids[i]
    if (head instanceof HTMLElement && head.tagName === 'SPAN') i++
    while (i < kids.length && isGap(kids[i])) kids[i++].remove()
    let j = kids.length - 1
    while (j >= i && isGap(kids[j])) kids[j--].remove()
    let brs: ChildNode[] = []
    let pad: ChildNode[] = []
    const flush = () => {
      if (brs.length >= 2) {
        brs.slice(2).forEach((n) => n.remove())
        pad.forEach((n) => n.remove())
      }
      brs = []
      pad = []
    }
    for (const child of [...quote.childNodes]) {
      if (isBr(child)) brs.push(child)
      else if (isPad(child)) pad.push(child)
      else flush()
    }
    flush()
  }
  return body.innerHTML
}

const IMAGE_HREF = /\.(png|jpe?g|gif|webp|avif)$/i

/** Zoomable when the image is bare or its link just points at a picture. */
function zoomableSrc(el: EventTarget | null): string | null {
  if (!(el instanceof HTMLImageElement)) return null
  const link = el.closest('a')
  if (link) {
    let href = link.href
    try {
      href = decodeURIComponent(href)
    } catch {
      // Malformed escapes: judge the raw href instead.
    }
    if (!IMAGE_HREF.test(href)) return null
  }
  return el.currentSrc || el.src
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center p-6"
      // A translucent background would not paint here; the backdrop filter carries the scrim.
      style={{ backdropFilter: 'blur(10px) brightness(0.35)' }}
      onClick={onClose}
    >
      <img src={src} alt="" className="max-h-full max-w-full rounded-lg shadow-book-lift" />
    </div>,
    getPortalContainer()
  )
}

/** MAM rich-content (sanitized upstream) in readable Reading Room typography. */
export function RichHtml({ html, className }: { html: string; className?: string }) {
  const [zoom, setZoom] = useState<string | null>(null)
  // Whether a color in a post can be read depends on which side is painted, so
  // a flip sends the fragment back through the same pass. Rebuilding it costs a
  // reader their open spoilers plus any selection, so nothing smaller counts.
  const [side, setSide] = useState(0)
  useEffect(() => onThemeSide(() => setSide((n) => n + 1)), [])
  const body = useMemo(
    () => tameHtml(rewriteHiddenBlocks(tidyQuotes(html))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [html, side]
  )

  function onClick(e: MouseEvent<HTMLDivElement>) {
    // The trigger is a real button, so it brings its own Enter and Space.
    if (toggleSpoiler(e.target)) {
      e.preventDefault()
      return
    }
    const src = zoomableSrc(e.target)
    if (!src) return
    e.preventDefault()
    setZoom(src)
  }

  return (
    <>
    {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    <div
      onClick={onClick}
      className={cn(
        'user-html text-[13.5px] leading-relaxed [overflow-wrap:anywhere]',
        // A percentage cap inside a table cell is circular, so the cap on images
        // there is a flat length. Wider tables scroll in their lane instead.
        '[&_.table-lane]:max-w-full [&_.table-lane]:overflow-x-auto [&_table_img]:max-w-[20rem] [&_table_img:hover]:max-w-[20rem]',
        '[&_:where(:not(a))>img]:cursor-zoom-in [&_a]:text-brand [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:rounded-md [&_blockquote]:bg-muted [&_blockquote]:px-3 [&_blockquote]:py-2 [&_blockquote]:text-[13px] [&_img]:my-1 [&_img]:h-auto [&_img]:max-h-[600px] [&_img]:max-w-[min(600px,100%)] [&_img]:rounded-md [&_img:hover]:max-h-none [&_img:hover]:max-w-full [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_table]:my-2 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc',
        QUOTE_CLASSES,
        className
      )}
      dangerouslySetInnerHTML={{ __html: body }}
    />
    </>
  )
}

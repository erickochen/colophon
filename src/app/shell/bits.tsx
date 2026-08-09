// Small shared page components (Reading Room voice).
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { mutedUserColor } from '@/lib/colors'
import { rewriteHiddenBlocks, toggleSpoiler } from '@/lib/hidden-text'
import { getPortalContainer } from '@/lib/portals'
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

export function Crumbs({ items }: { items: { name: string; href: string | null }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted-foreground">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-border">/</span>}
          {c.href ? (
            <a href={c.href} className="hover:text-foreground hover:underline">{c.name}</a>
          ) : (
            <span className="text-foreground">{c.name}</span>
          )}
        </span>
      ))}
    </nav>
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
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {prevHref && (
        <a href={prevHref} className="rounded-md border px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent/50">
          ← Prev
        </a>
      )}
      {pages.map((p, i) => {
        const prev = pages[i - 1]
        const gap = prev && /^\d+$/.test(prev.label) && /^\d+$/.test(p.label) && Number(p.label) - Number(prev.label) > 1
        return (<span key={i} className="flex items-center gap-1">
        {gap && <span className="px-0.5 text-[12px] text-muted-foreground">…</span>}
        {p.current ? (
          <span key={i} className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground">{p.label}</span>
        ) : (
          <a href={p.href} className="rounded-md border px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent/50">
            {p.label}
          </a>
        )}
        </span>)
      })}
      {nextHref && (
        <a href={nextHref} className="rounded-md border px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:bg-accent/50">
          Next →
        </a>
      )}
    </div>
  )
}

/* MAM quotes are <div class="quote"><span>… wrote:</span>…</div>. Fill, spacing
 * and the attribution line mark where a quote starts and ends; the serif quote
 * mark lives in index.css. Shared with the composer so writing matches posting. */
export const QUOTE_CLASSES =
  '[&_.quote]:my-3 [&_.quote]:rounded-md [&_.quote]:bg-muted [&_.quote]:py-2.5 [&_.quote]:pr-3.5 [&_.quote]:pl-4 [&_.quote]:text-[13px] [&_.quote>span]:mb-1.5 [&_.quote>span]:block [&_.quote>span]:text-[11.5px] [&_.quote>span]:font-semibold [&_.quote>span]:text-muted-foreground [&_.quote_p:last-child]:mb-0'

/* MAM's editor writes every line as its own <p> and renders <p> without
 * margins, so blank lines only come from explicitly empty paragraphs. Post
 * bodies match that; RichHtml's default paragraph gap would double-space them. */
export const POST_SPACING = 'leading-normal [&_p]:my-0'

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
  const body = useMemo(() => rewriteHiddenBlocks(html), [html])

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
        'user-html text-[13.5px] leading-relaxed [overflow-wrap:anywhere] [&_:where(:not(a))>img]:cursor-zoom-in [&_a]:text-brand [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:rounded-md [&_blockquote]:bg-muted [&_blockquote]:px-3 [&_blockquote]:py-2 [&_blockquote]:text-[13px] [&_img]:my-1 [&_img]:h-auto [&_img]:max-h-[600px] [&_img]:max-w-[min(600px,100%)] [&_img]:rounded-md [&_img:hover]:max-h-none [&_img:hover]:max-w-full [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_table]:my-2 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc',
        QUOTE_CLASSES,
        className
      )}
      dangerouslySetInnerHTML={{ __html: body }}
    />
    </>
  )
}

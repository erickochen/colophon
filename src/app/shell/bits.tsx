// Small shared page components (Reading Room voice).
import type { ReactNode } from 'react'
import { mutedUserColor } from '@/lib/colors'
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

export function UserLink({ name, href, color, className }: { name: string | null; href?: string | null; color?: string | null; className?: string }) {
  if (!name) return null
  const style = color ? { color: mutedUserColor(color) } : undefined
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

/** MAM rich-content (sanitized upstream) in readable Reading Room typography. */
export function RichHtml({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn(
        'user-html text-[13.5px] leading-relaxed [overflow-wrap:anywhere] [&_a]:text-brand [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-brand/40 [&_blockquote]:bg-muted/50 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_blockquote]:text-[13px] [&_img]:my-1 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_table]:my-2 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc ' +
          // MAM quotes are <div class="quote"><span>… wrote:</span>…</div>. Fill +
          // spacing + a distinct attribution line set the quote clearly apart from
          // the reply (nested quotes too); the accent bar lives in index.css since
          // borders are reset away. See #mam-root .quote.
          '[&_.quote]:my-3 [&_.quote]:rounded-md [&_.quote]:bg-muted/60 [&_.quote]:py-2.5 [&_.quote]:pr-3.5 [&_.quote]:pl-4 [&_.quote]:text-[13px] [&_.quote>span]:mb-1.5 [&_.quote>span]:block [&_.quote>span]:text-[11.5px] [&_.quote>span]:font-semibold [&_.quote>span]:text-muted-foreground [&_.quote_p:last-child]:mb-0',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// Tag links for browse rows and torrent detail. Both read the same free-text
// field, so both parse and render it the same way.
import { Fragment } from 'react'
import { parseSegments, tagSearchHref } from '@/lib/tags'
import { cn } from '@/lib/utils'

const LINK_CLS =
  'rounded-sm transition-colors hover:text-brand hover:underline focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none'

export function TagLinks({ raw, limit, full = false, chips = false, className }: {
  raw: string | number | null | undefined
  /** Show at most this many, then a plain remainder count. */
  limit?: number
  /** Also print the parts too long to pass as a tag, so nothing is lost. */
  full?: boolean
  /** Draw the searchable tags as pills, with the loose facts on their own line. */
  chips?: boolean
  className?: string
}) {
  const segments = parseSegments(raw)
  const parts = full ? segments : segments.filter((s) => s.searchable)
  if (parts.length === 0) return null

  if (chips) {
    const tags = segments.filter((s) => s.searchable)
    const facts = full ? segments.filter((s) => !s.searchable) : []
    return (
      <span className={cn('block', className)}>
        {tags.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {tags.map((seg, i) => (
              <a
                key={`${seg.text}-${i}`}
                href={tagSearchHref(seg.text)}
                className="rounded-full border px-2 py-[3px] text-[11.5px] leading-none text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
              >
                {seg.text}
              </a>
            ))}
          </span>
        )}
        {facts.length > 0 && (
          <span className={cn('block text-[12.5px] text-muted-foreground', tags.length > 0 && 'mt-2')}>
            {facts.map((s) => s.text).join(' · ')}
          </span>
        )}
      </span>
    )
  }

  const shown = limit != null ? parts.slice(0, limit) : parts
  const rest = parts.slice(shown.length)

  return (
    <span className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5', className)}>
      {shown.map((seg, i) => (
        <Fragment key={`${seg.text}-${i}`}>
          {i > 0 && <span aria-hidden="true" className="text-muted-foreground/50">·</span>}
          {seg.searchable ? (
            <a href={tagSearchHref(seg.text)} className={LINK_CLS}>{seg.text}</a>
          ) : (
            <span className="text-muted-foreground">{seg.text}</span>
          )}
        </Fragment>
      ))}
      {rest.length > 0 && (
        <span className="text-muted-foreground/70" title={rest.map((s) => s.text).join(', ')}>+{rest.length}</span>
      )}
    </span>
  )
}

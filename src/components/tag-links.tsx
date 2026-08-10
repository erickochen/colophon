// Tag links for browse rows and torrent detail. Both read the same free-text
// field, so both parse and render it the same way.
import { Fragment } from 'react'
import { parseSegments, tagSearchHref } from '@/lib/tags'
import { cn } from '@/lib/utils'

const LINK_CLS =
  'rounded-sm transition-colors hover:text-brand hover:underline focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none'

export function TagLinks({ raw, limit, full = false, className }: {
  raw: string | null | undefined
  /** Show at most this many, then a plain remainder count. */
  limit?: number
  /** Also print the parts too long to pass as a tag, so nothing is lost. */
  full?: boolean
  className?: string
}) {
  const segments = parseSegments(raw)
  const parts = full ? segments : segments.filter((s) => s.searchable)
  if (parts.length === 0) return null

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

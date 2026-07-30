// One bubble language for every back and forth on the site: staff tickets and
// private messages. Own messages sit on the right in the brand tint, the other
// side on the left on card colour.
import { useId, type ReactNode } from 'react'
import { mutedUserColor } from '@/lib/colors'
import { dateOnly, initials, relTime } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function Conversation({
  children,
  className,
  label,
  busy,
}: {
  children: ReactNode
  className?: string
  /** Names the exchange for a screen reader. */
  label?: string
  /** True while message bodies are still arriving. */
  busy?: boolean
}) {
  return (
    <div
      role={label ? 'feed' : undefined}
      aria-label={label}
      aria-busy={busy}
      className={cn('grid gap-3', className)}
    >
      {children}
    </div>
  )
}

export function ConversationBubble({
  author,
  href,
  color,
  at,
  mine,
  badge,
  actions,
  footer,
  children,
  position,
  total,
}: {
  author: string
  href?: string | null
  color?: string | null
  at?: string | null
  mine?: boolean
  /** Small label next to the name, like a role. */
  badge?: ReactNode
  /** Row of controls that stays reachable without a pointer. */
  actions?: ReactNode
  /** Sits under the body inside the bubble. */
  footer?: ReactNode
  children: ReactNode
  /** One-based place in the exchange, for screen readers. */
  position?: number
  total?: number
}) {
  const style = color ? { color: mutedUserColor(color) } : undefined
  const bodyId = useId()
  const who = mine ? 'You' : author
  return (
    <article
      aria-label={at ? `${who}, ${dateOnly(at)}` : who}
      aria-describedby={bodyId}
      aria-posinset={position}
      aria-setsize={total}
      className={cn('group/bubble flex gap-3', mine && 'flex-row-reverse')}
    >
      <Avatar aria-hidden="true" className="size-9 shrink-0 rounded-lg">
        <AvatarFallback
          className={cn(
            'rounded-lg text-[11px] font-semibold',
            mine ? 'bg-primary text-primary-foreground' : 'bg-brand-soft text-accent-foreground'
          )}
        >
          {initials(author)}
        </AvatarFallback>
      </Avatar>
      <div className={cn('min-w-0 max-w-[85%] flex-1', mine && 'flex flex-col items-end')}>
        <div className={cn('flex items-baseline gap-2 pb-1', mine && 'flex-row-reverse')}>
          {href ? (
            <a href={href} className="text-[12.5px] font-semibold hover:underline" style={style}>{author}</a>
          ) : (
            <span className="text-[12.5px] font-semibold" style={style}>{author}</span>
          )}
          {badge}
          {at && (
            <time dateTime={at.replace(' ', 'T')} className="text-[11px] text-muted-foreground">
              {relTime(at)}
              <span className="sr-only"> ({at})</span>
            </time>
          )}
          {actions}
        </div>
        <div
          className={cn(
            'min-w-0 rounded-xl border px-4 py-3',
            mine ? 'rounded-tr-sm border-brand/25 bg-brand-soft/50' : 'rounded-tl-sm bg-card'
          )}
        >
          {/* Only the message itself describes the bubble, so a folded quote
              stays out of the spoken summary. */}
          <div id={bodyId}>{children}</div>
          {footer}
        </div>
      </div>
    </article>
  )
}

/** Per-message controls. Full strength on hover or focus, dimmed but present
 * otherwise, so the actions never depend on a pointer to exist. */
export function BubbleActions({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 opacity-40 transition-opacity group-hover/bubble:opacity-100 focus-within:opacity-100 has-data-popup-open:opacity-100"
    >
      {children}
    </span>
  )
}

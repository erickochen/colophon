// One bubble language for every back and forth on the site: staff tickets and
// private messages. Own messages sit on the right in the brand tint, the other
// side on the left on card colour.
import type { ReactNode } from 'react'
import { mutedUserColor } from '@/lib/colors'
import { initials, relTime } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function Conversation({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-3', className)}>{children}</div>
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
}: {
  author: string
  href?: string | null
  color?: string | null
  at?: string | null
  mine?: boolean
  /** Small label next to the name, like a role. */
  badge?: ReactNode
  /** Row of controls that fades in on hover. */
  actions?: ReactNode
  /** Sits under the body inside the bubble. */
  footer?: ReactNode
  children: ReactNode
}) {
  const style = color ? { color: mutedUserColor(color) } : undefined
  return (
    <div className={cn('group/bubble flex gap-3', mine && 'flex-row-reverse')}>
      <Avatar className="size-9 shrink-0 rounded-lg">
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
          {at && <span className="text-[11px] text-muted-foreground" title={at}>{relTime(at)}</span>}
          {actions && (
            <span className="opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-within:opacity-100">
              {actions}
            </span>
          )}
        </div>
        <div
          className={cn(
            'min-w-0 rounded-xl border px-4 py-3',
            mine ? 'rounded-tr-sm border-brand/25 bg-brand-soft/50' : 'rounded-tl-sm bg-card'
          )}
        >
          {children}
          {footer}
        </div>
      </div>
    </div>
  )
}

// One bubble language for every back and forth on the site: staff tickets and
// private messages. Own messages sit on the right in the brand tint, the other
// side on the left on card colour.
import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useState,
  type KeyboardEvent, type ReactNode,
} from 'react'
import { mutedUserColor } from '@/lib/colors'
import { dateOnly, initials, relTime, utcTitle } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

/** Which message the arrow keys act on. One tab stop for the whole exchange,
 * so a long conversation does not bury the composer behind every button. */
const NavContext = createContext<{ activeKey: string | null; setActiveKey: (k: string | null) => void } | null>(null)

const BUBBLE_ATTR = 'data-bubble'

export function useConversationNav(navKey?: string) {
  const ctx = useContext(NavContext)
  return {
    navigable: !!ctx,
    active: !!ctx && !!navKey && ctx.activeKey === navKey,
    setActiveKey: ctx?.setActiveKey,
  }
}

// A highlight made inside a shadow root is not visible through
// document.getSelection(): it reports the text but calls itself collapsed and
// anchors outside the root. ShadowRoot.getSelection() answers properly.
type SelectionRoot = ShadowRoot & { getSelection?: () => Selection | null }

function liveSelection(from: Node | null | undefined): Selection | null {
  const root = from?.getRootNode()
  if (root && root !== document) {
    const own = (root as SelectionRoot).getSelection?.()
    if (own && !own.isCollapsed && own.rangeCount > 0) return own
  }
  const doc = document.getSelection()
  return doc && !doc.isCollapsed && doc.rangeCount > 0 ? doc : null
}

/** Selected text inside one message, for quoting exactly what was highlighted. */
export function selectionWithin(root: Element | null): string | null {
  if (!root) return null
  const sel = liveSelection(root)
  if (!sel) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  return sel.toString().replace(/\s+/g, ' ').trim() || null
}

export interface BubbleSelection {
  /** navKey of the message the highlight sits in. */
  navKey: string
  text: string
  /** Viewport position of the highlight, for placing a button above it. */
  left: number
  top: number
}

const asElement = (node: Node | null) =>
  node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement ?? null

/** Reads a highlight that sits wholly inside one message. Needs an element from
 * the same tree to find the right selection owner. Null when there is no
 * highlight or when it crosses out of a single message. */
export function readBubbleSelection(within: Element | null): BubbleSelection | null {
  const sel = liveSelection(within)
  if (!sel) return null
  const range = sel.getRangeAt(0)
  const bubble = asElement(range.startContainer)?.closest(`[${BUBBLE_ATTR}]`)
  if (!bubble || !bubble.contains(range.endContainer)) return null
  const navKey = bubble.getAttribute(BUBBLE_ATTR)
  const text = sel.toString().replace(/\s+/g, ' ').trim()
  if (!navKey || !text) return null
  const rect = range.getBoundingClientRect()
  return { navKey, text, left: rect.left + rect.width / 2, top: rect.top }
}

export function Conversation({
  children,
  className,
  label,
  busy,
  /** Key of the message the arrows start on, normally the newest. */
  startKey,
}: {
  children: ReactNode
  className?: string
  /** Names the exchange for a screen reader and turns on arrow navigation. */
  label?: string
  busy?: boolean
  startKey?: string | null
}) {
  const [activeKey, setActiveKey] = useState<string | null>(startKey ?? null)

  // A new conversation starts on its newest message again.
  useEffect(() => {
    setActiveKey(startKey ?? null)
  }, [startKey])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!label) return
    const target = e.target as HTMLElement
    // Arrows move between messages only while a message itself holds focus, so
    // Tab keeps working to reach the buttons inside one.
    if (!target.hasAttribute(BUBBLE_ATTR)) return
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(`[${BUBBLE_ATTR}]`)]
    const idx = items.indexOf(target)
    if (idx < 0) return
    let next = idx
    if (e.key === 'ArrowUp') next = Math.max(0, idx - 1)
    else if (e.key === 'ArrowDown') next = Math.min(items.length - 1, idx + 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else return
    e.preventDefault()
    const el = items[next]
    setActiveKey(el.getAttribute(BUBBLE_ATTR))
    el.focus()
    el.scrollIntoView({ block: 'nearest' })
  }

  const body = (
    <div
      role={label ? 'feed' : undefined}
      aria-label={label}
      aria-busy={busy}
      onKeyDown={onKeyDown}
      className={cn('grid gap-3', className)}
    >
      {children}
    </div>
  )

  // Kept stable on purpose: a fresh object here re-renders every bubble, which
  // rebuilds their text and drops any selection the reader was making.
  const nav = useMemo(() => ({ activeKey, setActiveKey }), [activeKey])

  if (!label) return body
  return <NavContext.Provider value={nav}>{body}</NavContext.Provider>
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
  navKey,
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
  /** Identity for arrow navigation. Without it the bubble is not focusable. */
  navKey?: string
}) {
  const style = color ? { color: mutedUserColor(color) } : undefined
  const bodyId = useId()
  const { navigable, active, setActiveKey } = useConversationNav(navKey)
  const who = mine ? 'You' : author
  return (
    <article
      {...(navKey ? { [BUBBLE_ATTR]: navKey } : {})}
      tabIndex={navigable && navKey ? (active ? 0 : -1) : undefined}
      onFocus={() => navKey && !active && setActiveKey?.(navKey)}
      aria-label={at ? `${who}, ${dateOnly(at)}` : who}
      aria-describedby={bodyId}
      aria-posinset={position}
      aria-setsize={total}
      className={cn(
        'group/bubble flex gap-3 rounded-xl',
        navigable && 'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
        mine && 'flex-row-reverse'
      )}
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
            <time dateTime={at.replace(' ', 'T') + 'Z'} title={utcTitle(at)} className="text-[11px] text-muted-foreground">
              {relTime(at)}
              <span className="sr-only"> ({at} UTC)</span>
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

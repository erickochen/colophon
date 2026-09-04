// Highlighting inside a message or a post offers to quote exactly that much.
// The button owns the selection state so a moving highlight never re-renders
// the thread behind it: rebuilding those bodies would drop the highlight the
// reader is still dragging.
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { Quote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { readBubbleSelection, type BubbleSelection } from '@/components/conversation'

/** Gap between a highlight and the button above it, in pixels. */
const LIFT = 38
/** Half the button plus a little air, so a highlight against either edge of a
 * narrow screen still gets a button that is fully on it. */
const EDGE = 64

/** Same highlight in the same spot, so a fresh reading changes nothing. */
function same(a: BubbleSelection | null, b: BubbleSelection | null): boolean {
  if (!a || !b) return a === b
  return (
    a.navKey === b.navKey &&
    a.text === b.text &&
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left)
  )
}

export function SelectionQuote({
  scope,
  onQuote,
  label = 'Quote this',
  disabled,
}: {
  /** The region holding the quotable blocks, each marked with data-bubble. */
  scope: RefObject<HTMLElement | null>
  onQuote: (selection: BubbleSelection) => void
  label?: string
  disabled?: boolean
}) {
  const [found, setFound] = useState<BubbleSelection | null>(null)

  const refresh = useCallback(() => {
    const box = scope.current?.getBoundingClientRect()
    const next = box ? readBubbleSelection(scope.current) : null
    // The button is placed against the viewport, so it only shows while the
    // highlight is both inside the region plus actually on screen.
    const top = Math.max(box?.top ?? 0, 0) + LIFT
    const bottom = Math.min(box?.bottom ?? 0, window.innerHeight)
    const shown = next && next.top > top && next.top < bottom ? next : null
    setFound((prev) => (same(prev, shown) ? prev : shown))
  }, [scope])

  useEffect(() => {
    if (disabled) {
      setFound(null)
      return
    }
    const root = scope.current?.getRootNode()
    document.addEventListener('selectionchange', refresh)
    root?.addEventListener('selectionchange', refresh)
    // Scrolling moves the highlight while the button sits against the viewport.
    // A scroll event neither bubbles nor crosses the shadow boundary, so the
    // capture phase catches a panel that scrolls on its own plus the root has
    // to be listened to as well for the panels inside it.
    document.addEventListener('scroll', refresh, true)
    root?.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
    return () => {
      document.removeEventListener('selectionchange', refresh)
      root?.removeEventListener('selectionchange', refresh)
      document.removeEventListener('scroll', refresh, true)
      root?.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
    }
  }, [refresh, disabled, scope])

  if (disabled || !found) return null
  return (
    <Button
      size="sm"
      style={{
        position: 'fixed',
        left: Math.min(Math.max(found.left, EDGE), window.innerWidth - EDGE),
        top: found.top - LIFT,
        transform: 'translateX(-50%)',
      }}
      className="z-50 h-7 text-12 shadow-lg"
      // Pressing the button must not take the highlight away before it is read.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onQuote(found)
        // The highlight has done its work; the offer goes away until the reader
        // makes a new one.
        setFound(null)
      }}
    >
      <Quote aria-hidden="true" /> {label}
    </Button>
  )
}

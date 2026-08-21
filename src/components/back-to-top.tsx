import { useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { bottomFloatRef, dockMoved, useDockClearance } from '@/lib/bottom-dock'
import { scrollTo } from '@/lib/motion'
import { useDocScroll } from '@/lib/scroll'
import { cn } from '@/lib/utils'

// One screen of travel before it turns up, so short trips keep the corner free.
const SHOW_AFTER_SCREENS = 1
// The ring lives in the outer edge of the disc.
const RING_WIDTH_PX = 2
const FULL_TURN_DEG = 360
// Same distance from the corner as the toast lane.
const CORNER_GAP_PX = 16

// Keeps only the outer edge of the disc, so both layers read as a ring.
const ANNULUS = `radial-gradient(farthest-side, transparent calc(100% - ${RING_WIDTH_PX}px), #000 calc(100% - ${RING_WIDTH_PX}px))`

/** Jumps back to the top of a long page, with how far down you are drawn around
 * the arrow. Mounted once for the whole shell, so every long page has it. */
export function BackToTop({ host }: { host: HTMLElement }) {
  const { progress, screens, tall } = useDocScroll()
  // The clearance is measured from the docked bar, so it already says how far
  // from the bottom the button belongs.
  const clearance = useDockClearance()
  const lift = Math.max(CORNER_GAP_PX, clearance)

  const active = tall && screens >= SHOW_AFTER_SCREENS

  // Stepping above a bar moves the button without resizing it, so the toast lane
  // is told rather than left to notice.
  useEffect(() => {
    dockMoved()
  }, [lift, active])

  function toTop(): void {
    // Focus travels with the scroll. Without it the next Tab would carry on
    // from a corner button instead of the top of the page.
    host.shadowRoot?.getElementById('colophon-main')?.focus({ preventScroll: true })
    scrollTo(document.documentElement, { top: 0 })
  }

  return (
    <div
      // Only while it is on screen: the toast lane reads this to keep clear.
      ref={active ? bottomFloatRef : null}
      data-active={active}
      inert={!active}
      style={{ bottom: `${lift}px` }}
      className={cn(
        // Coming and going is animated. Stepping above a bar is not: a target
        // that slides while you aim at it is harder to hit.
        'fixed right-4 z-40 transition-[translate,scale,opacity] duration-200 motion-reduce:transition-none',
        'data-[active=false]:pointer-events-none data-[active=false]:translate-y-3 data-[active=false]:scale-95 data-[active=false]:opacity-0',
        'data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100'
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            onClick={toTop}
            aria-label="Back to top"
            className="relative rounded-full border-0 bg-card/85 text-foreground shadow-lg [backdrop-filter:blur(8px)] hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden className="absolute inset-0 rounded-full bg-border" style={{ maskImage: ANNULUS, WebkitMaskImage: ANNULUS }} />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(var(--brand) ${progress * FULL_TURN_DEG}deg, transparent 0)`,
                maskImage: ANNULUS,
                WebkitMaskImage: ANNULUS,
              }}
            />
            <ArrowUp />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Back to top</TooltipContent>
      </Tooltip>
    </div>
  )
}

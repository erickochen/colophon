"use client"

/* Apple Cards Carousel from Aceternity UI. The port keeps the mechanics: a
 * plain scroll container, so trackpad, wheel and swipe keep working, plus
 * arrows that page it and stop at the ends. Icons come from lucide, the colors
 * from our tokens, the spacing from props. Less motion is respected. */

import * as React from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { scrollBehavior } from "@/lib/motion"

// How far one press of an arrow travels, in pixels, as the original ships it.
const CAROUSEL_STEP = 300
// Seconds between two neighbors arriving.
const CAROUSEL_STAGGER = 0.2
// One item's own entrance.
const CAROUSEL_ENTRANCE_SECONDS = 0.5

const CAROUSEL_ARROW =
  "relative z-40 flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"

export interface AppleCardsCarouselProps {
  items: React.ReactNode[]
  /** Where the shelf starts, for a carousel that reopens where it was left. */
  initialScroll?: number
  /** Pixels one arrow press travels. */
  step?: number
  /** Seconds between two neighbors arriving. */
  stagger?: number
  className?: string
  /** The scrolling box itself, for its own padding. */
  viewportClassName?: string
  /** The row inside it, for the gap between items and its own width. */
  rowClassName?: string
  /** Every item's wrapper, for the room the last one needs. */
  itemClassName?: string
  /** The row of arrows under the shelf. */
  arrowsClassName?: string
  /** What the two arrows are called, since an icon alone has no name. */
  prevLabel?: string
  nextLabel?: string
}

export function AppleCardsCarousel({
  items,
  initialScroll = 0,
  step = CAROUSEL_STEP,
  stagger = CAROUSEL_STAGGER,
  className,
  viewportClassName = "py-10 md:py-20",
  rowClassName = "mx-auto max-w-7xl gap-4 pl-4",
  itemClassName = "rounded-3xl last:pr-[5%] md:last:pr-[33%]",
  arrowsClassName = "mr-10",
  prevLabel = "Previous",
  nextLabel = "Next",
}: AppleCardsCarouselProps) {
  const carouselRef = React.useRef<HTMLDivElement>(null)
  const rowRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)
  const reduced = useReducedMotion()

  const checkScrollability = React.useCallback(() => {
    const el = carouselRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }, [])

  React.useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    el.scrollLeft = initialScroll
  }, [initialScroll])

  React.useEffect(() => {
    const el = carouselRef.current
    const row = rowRef.current
    if (!el || !row) return
    checkScrollability()
    // A shelf that fits at one width overflows at another, plus items arriving
    // change the row on their own, so both sides of the sum are watched.
    const ro = new ResizeObserver(checkScrollability)
    ro.observe(el)
    ro.observe(row)
    return () => ro.disconnect()
  }, [checkScrollability])

  const page = (direction: -1 | 1) => {
    carouselRef.current?.scrollBy({ left: direction * step, behavior: scrollBehavior() })
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={carouselRef}
        onScroll={checkScrollability}
        className={cn(
          "flex w-full overflow-x-scroll overscroll-x-auto [-ms-overflow-style:none] [scrollbar-width:none] motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden",
          viewportClassName
        )}
      >
        <div ref={rowRef} className={cn("flex flex-row justify-start", rowClassName)}>
          {items.map((item, index) => (
            <motion.div
              key={index}
              initial={reduced ? undefined : { opacity: 0, y: 20 }}
              animate={reduced ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: CAROUSEL_ENTRANCE_SECONDS, delay: stagger * index, ease: "easeOut" }}
              className={itemClassName}
            >
              {item}
            </motion.div>
          ))}
        </div>
      </div>
      {(canScrollLeft || canScrollRight) && (
        <div className={cn("flex justify-end gap-2", arrowsClassName)}>
          <button type="button" aria-label={prevLabel} disabled={!canScrollLeft} onClick={() => page(-1)} className={CAROUSEL_ARROW}>
            <ArrowLeft className="size-3.5" />
          </button>
          <button type="button" aria-label={nextLabel} disabled={!canScrollRight} onClick={() => page(1)} className={CAROUSEL_ARROW}>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

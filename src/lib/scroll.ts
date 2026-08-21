import { useEffect, useState } from 'react'

// A page earns a reading aid once it runs well past one screen.
const TALL_PAGE_FACTOR = 1.8

export interface DocScroll {
  /** How far down the document is scrolled, 0 to 1. */
  progress: number
  /** Screens traveled from the top. */
  screens: number
  /** Whether the document runs long enough for a reading aid. */
  tall: boolean
}

/** Document scroll, measured once per frame. The document scrolls rather than
 * our shell, so this reads window scroll despite running inside the shadow
 * root. Call it from the leaf that needs it: the state changes every frame, so
 * one caller higher up would re-render the page on every scroll step. */
export function useDocScroll(): DocScroll {
  const [state, setState] = useState<DocScroll>({ progress: 0, screens: 0, tall: false })

  useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const next: DocScroll = {
        progress: max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0,
        screens: window.innerHeight > 0 ? window.scrollY / window.innerHeight : 0,
        tall: doc.scrollHeight > window.innerHeight * TALL_PAGE_FACTOR,
      }
      // Same numbers, same object: a frame that changed nothing draws nothing.
      setState((prev) =>
        prev.progress === next.progress && prev.screens === next.screens && prev.tall === next.tall ? prev : next
      )
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const obs = new ResizeObserver(schedule)
    obs.observe(document.documentElement)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      obs.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return state
}

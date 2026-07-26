import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/** Reading progress for long pages, hidden on short ones. The document scrolls
 * rather than our shell, so this reads window scroll despite rendering inside
 * the shadow root. */
export function ScrollProgress({ className }: { className?: string }) {
  const [pct, setPct] = useState(0)
  const [show, setShow] = useState(false)

  useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      setShow(doc.scrollHeight > window.innerHeight * 1.8)
      setPct(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0)
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

  if (!show) return null

  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]', className)}>
      <div
        className="h-full bg-brand/80"
        style={{ width: `${pct * 100}%`, transition: 'width 90ms linear' }}
      />
    </div>
  )
}

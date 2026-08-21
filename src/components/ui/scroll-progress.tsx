import { useDocScroll } from "@/lib/scroll"
import { cn } from "@/lib/utils"

/** Reading progress for long pages, hidden on short ones. */
export function ScrollProgress({ className }: { className?: string }) {
  const { progress, tall } = useDocScroll()

  if (!tall) return null

  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]', className)}>
      {/* Scaled rather than widened: this runs on every scroll frame, so it
          stays off the layout. An inline transform sidesteps the Tailwind
          translate variables, which the shadow root does not carry. */}
      <div
        className="h-full w-full origin-left bg-brand/80"
        style={{ transform: `scaleX(${progress})`, transition: 'transform 90ms linear' }}
      />
    </div>
  )
}

// Shared chrome for the multi-step forms: the step bar, the sticky bar at the
// bottom plus the scroll and announce behavior a step change needs.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** The bar keeps the step names up to this many steps and shows numbers above it. */
const NAMED_STEPS = 5

/** Numbered steps, with the visited ones clickable. Names are shown while they
 * fit and serve as the accessible label once the bar goes compact. */
export function WizardSteps({
  steps, step, reached, onStep, label = 'Steps',
}: {
  steps: string[]
  step: number
  reached: number
  onStep: (n: number) => void
  label?: string
}) {
  const compact = steps.length > NAMED_STEPS
  return (
    <nav aria-label={label} className={cn('flex flex-wrap items-center', compact ? 'gap-0.5' : 'gap-1')}>
      {steps.map((name, i) => {
        const done = i < reached
        const here = i === step
        return (
          <div key={i} className={cn('flex items-center', compact ? 'gap-0.5' : 'gap-1')}>
            {i > 0 && (
              <span aria-hidden className={cn('h-px bg-border', compact ? 'w-1.5 sm:w-3' : 'w-4 sm:w-8')} />
            )}
            <button
              type="button"
              disabled={i > reached}
              aria-current={here ? 'step' : undefined}
              aria-label={compact ? name : undefined}
              title={compact ? name : undefined}
              onClick={() => onStep(i)}
              className={cn(
                'flex items-center gap-2 rounded-full py-1 text-[12.5px] transition-colors',
                compact ? 'px-0.5' : 'pl-1 pr-3',
                !compact && here && 'bg-brand-soft font-medium text-foreground',
                !here && 'text-muted-foreground',
                i <= reached && !here && 'hover:bg-muted',
                i > reached && 'cursor-not-allowed opacity-60'
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[11px] font-semibold',
                  here
                    ? 'bg-brand text-brand-foreground'
                    : done
                      ? 'bg-brand/15 text-brand'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {done && !here ? <Check className="size-3" /> : i + 1}
              </span>
              {!compact && name}
            </button>
          </div>
        )
      })}
    </nav>
  )
}

/** The bar that follows the reader down the page. The forward button is passed
 * in, since each wizard ends on something different. */
export function WizardNav({
  step, count, onBack, hint, children,
}: {
  step: number
  count: number
  onBack: () => void
  /** Replaces the step counter, for a reason the forward button is held back. */
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <Button variant="ghost" size="sm" disabled={step === 0} onClick={onBack}>
        <ChevronLeft /> Back
      </Button>
      <span className="text-[12px] text-muted-foreground">{hint ?? `Step ${step + 1} of ${count}`}</span>
      {children}
    </div>
  )
}

/** Puts the reader back at the top of a fresh step and says where they are.
 * Landing on the page must not move the scroll, so only a change counts. */
export function useWizardStep(step: number, announce: string) {
  const topRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState('')
  const last = useRef(step)
  useEffect(() => {
    if (last.current === step) return
    last.current = step
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setLive(announce)
  }, [step, announce])
  return { topRef, live }
}

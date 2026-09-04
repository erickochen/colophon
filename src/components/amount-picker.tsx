// One way to name an amount that leaves the account: shortcuts for the values
// people actually pick, a slider for everything between, plus the two ends of
// the allowance in writing. Typing a figure is never required.
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/ui/number-field'
import { Slider } from '@/components/ui/slider'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Shortcuts read as what they mean: nothing at one end, the whole allowance at
 * the other, a plain figure in between. */
function presetLabel(n: number, max: number): string {
  if (n === 0) return 'None'
  if (n === max) return `Max ${fmtInt(n)}`
  return fmtInt(n)
}

export function AmountPicker({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  presets = [],
  label,
  note,
  exact,
  disabled,
  className,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max: number
  step?: number
  /** Values worth one click. Anything outside the allowance is dropped. */
  presets?: number[]
  /** Names the slider for a screen reader, e.g. "Points to send". */
  label: string
  /** Sits under the slider, for what is left to spend. */
  note?: React.ReactNode
  /** Adds a typed figure beside the shortcuts, for an amount that has to land
   * on something the slider cannot comfortably reach. */
  exact?: boolean
  disabled?: boolean
  className?: string
}) {
  const shown = presets.filter((n) => n >= min && n <= max)
  return (
    <div className={cn('grid gap-3', className)}>
      {(shown.length > 0 || exact) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((n) => (
            <Button
              key={n}
              type="button"
              variant={n === value ? 'default' : 'outline'}
              size="sm"
              disabled={disabled}
              className="h-8 text-12-5 tabular-nums"
              onClick={() => onChange(n)}
            >
              {presetLabel(n, max)}
            </Button>
          ))}
          {exact && (
            <NumberField
              className="ml-auto"
              label={label}
              value={value}
              onValueChange={(n) => onChange(n ?? min)}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
            />
          )}
        </div>
      )}
      <div className="grid gap-1.5">
        <Slider
          thumbLabel={label}
          className="[&_[data-slot=slider-range]]:bg-brand-fill"
          value={value}
          onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] ?? min) : v)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
        />
        <div className="flex items-baseline justify-between gap-3 text-12 text-muted-foreground">
          <span className="tabular-nums">{fmtInt(min)}</span>
          {/* The note belongs to the ceiling, so it reads as one phrase with it. */}
          <span className="tabular-nums">
            {note && <span className="pr-1">{note}</span>}
            {fmtInt(max)}
          </span>
        </div>
      </div>
    </div>
  )
}

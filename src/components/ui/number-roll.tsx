import NumberFlow from '@number-flow/react'

import { cn } from '@/lib/utils'

/** Digits roll only when the value changes; the first paint is static. */
export function NumberRoll({ value, className }: { value: number; className?: string }) {
  return (
    <NumberFlow
      value={value}
      locales="en-US"
      format={{ maximumFractionDigits: 0 }}
      className={cn('inline-block tracking-wider text-foreground tabular-nums', className)}
    />
  )
}

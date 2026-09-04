import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"

import { cn } from "@/lib/utils"

/** A figure with a step on either side of it. The field clamps to min and max,
 * takes arrow keys plus formats what it shows. */
function NumberField({
  className,
  inputClassName,
  label,
  ...props
}: React.ComponentProps<typeof NumberFieldPrimitive.Root> & {
  /** Names the field for a screen reader. */
  label?: string
  inputClassName?: string
}) {
  return (
    <NumberFieldPrimitive.Root data-slot="number-field" {...props}>
      <NumberFieldPrimitive.Group
        className={cn(
          "flex h-8 items-center rounded-md border border-input-line bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 has-[input:disabled]:opacity-50",
          className
        )}
      >
        <NumberFieldPrimitive.Decrement
          aria-label="One step down"
          className="flex size-7 shrink-0 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </NumberFieldPrimitive.Decrement>
        <NumberFieldPrimitive.Input
          aria-label={label}
          className={cn(
            "h-full w-14 min-w-0 border-x border-input-line bg-transparent px-1 text-center text-12-5 tabular-nums outline-none",
            inputClassName
          )}
        />
        <NumberFieldPrimitive.Increment
          aria-label="One step up"
          className="flex size-7 shrink-0 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </NumberFieldPrimitive.Increment>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  )
}

export { NumberField }

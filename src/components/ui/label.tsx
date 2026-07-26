import * as React from "react"

import { cn } from "@/lib/utils"

function Label({
  className,
  onMouseDown,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      onMouseDown={(event) => {
        // Radix Label behavior: block text selection on double click.
        const target = event.target as HTMLElement
        if (target.closest("button, input, select, textarea")) return
        onMouseDown?.(event)
        if (!event.defaultPrevented && event.detail > 1) event.preventDefault()
      }}
      {...props}
    />
  )
}

export { Label }

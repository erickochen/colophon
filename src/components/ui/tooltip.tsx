import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"
import { withAsChild } from "@/lib/base-ui"
import { getPortalContainer } from "@/lib/portals"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider> & {
  delayDuration?: number
}) {
  return <TooltipPrimitive.Provider delay={delayDuration} {...props} />
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

function TooltipTrigger({
  asChild,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger> & { asChild?: boolean }) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...withAsChild({ asChild, ...props })} />
}

function TooltipContent({
  className,
  side,
  align,
  sideOffset = 0,
  alignOffset,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof TooltipPrimitive.Positioner>,
    "side" | "align" | "sideOffset" | "alignOffset"
  >) {
  return (
    <TooltipPrimitive.Portal container={getPortalContainer()}>
      {/* Fixed positioning: the absolute path mislays anchors that sit inside a
          scrolled container within the shadow root. */}
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        positionMethod="fixed"
        className="z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 w-fit origin-(--transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-[-5px] data-[side=left]:right-[-5px] data-[side=right]:left-[-5px] data-[side=top]:bottom-[-5px]" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

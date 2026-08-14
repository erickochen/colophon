import { Autocomplete as AutocompletePrimitive } from "@base-ui/react"

import { cn } from "@/lib/utils"
import { getPortalContainer } from "@/lib/portals"

const Autocomplete = AutocompletePrimitive.Root

const AutocompleteInput = AutocompletePrimitive.Input

function AutocompleteContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  hidden,
  ...popup
}: AutocompletePrimitive.Popup.Props &
  Pick<
    AutocompletePrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset"
  > &
  Pick<AutocompletePrimitive.Portal.Props, "hidden">) {
  return (
    <AutocompletePrimitive.Portal container={getPortalContainer()} hidden={hidden}>
      <AutocompletePrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <AutocompletePrimitive.Popup
          data-slot="autocomplete-content"
          className={cn(
            "relative max-h-96 w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...popup}
        />
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  )
}

function AutocompleteList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="autocomplete-list"
      className={cn("scroll-py-1 overflow-y-auto overscroll-contain p-1", className)}
      {...props}
    />
  )
}

function AutocompleteItem({ className, ...props }: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

/** Announces list changes politely, so a lookup that is still running or came
 * back empty reaches a screen reader. The element itself carries no styling
 * that could take it out of the flow: a live region only announces while it
 * stays in the DOM, so swap its children rather than the region. */
const AutocompleteStatus = AutocompletePrimitive.Status

export {
  Autocomplete,
  AutocompleteInput,
  AutocompleteContent,
  AutocompleteList,
  AutocompleteItem,
  AutocompleteStatus,
}

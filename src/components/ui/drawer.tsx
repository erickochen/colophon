import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"

import { cn } from "@/lib/utils"
import { withAsChild } from "@/lib/base-ui"
import { getPortalContainer } from "@/lib/portals"

type DrawerDirection = "top" | "bottom" | "left" | "right"

const SWIPE: Record<DrawerDirection, "up" | "down" | "left" | "right"> = {
  top: "up",
  bottom: "down",
  left: "left",
  right: "right",
}

// DrawerContent styles by direction, which only the Root knows.
const DrawerDirectionContext = React.createContext<DrawerDirection>("bottom")

function Drawer({
  direction = "bottom",
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & {
  direction?: DrawerDirection
}) {
  return (
    <DrawerDirectionContext.Provider value={direction}>
      <DrawerPrimitive.Root swipeDirection={SWIPE[direction]} {...props} />
    </DrawerDirectionContext.Provider>
  )
}

function DrawerTrigger({
  asChild,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger> & { asChild?: boolean }) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...withAsChild({ asChild, ...props })} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal container={getPortalContainer()} {...props} />
}

function DrawerClose({
  asChild,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close> & { asChild?: boolean }) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...withAsChild({ asChild, ...props })} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Backdrop>) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/25 [backdrop-filter:blur(4px)_brightness(0.72)_saturate(0.9)] data-open:animate-in data-open:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Popup>) {
  const direction = React.useContext(DrawerDirectionContext)
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Viewport>
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          data-vaul-drawer-direction={direction}
          className={cn(
            "group/drawer-content fixed z-50 flex h-auto flex-col bg-background",
            "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
            "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
            "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
            "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
            className
          )}
          {...props}
        >
          <div className="mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
          {children}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}

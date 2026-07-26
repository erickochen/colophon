import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import {
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { getPortalContainer } from "@/lib/portals"

const manager = ToastPrimitive.createToastManager()

type ToastOptions = { description?: React.ReactNode; duration?: number }

function add(type: string, title: React.ReactNode, opts?: ToastOptions) {
  return manager.add({
    title,
    description: opts?.description,
    type,
    timeout: opts?.duration,
  })
}

// Drop-in for the sonner call sites: toast(...), toast.success(...), etc.
export const toast = Object.assign(
  (title: React.ReactNode, opts?: ToastOptions) => add("default", title, opts),
  {
    success: (title: React.ReactNode, opts?: ToastOptions) => add("success", title, opts),
    error: (title: React.ReactNode, opts?: ToastOptions) => add("error", title, opts),
    warning: (title: React.ReactNode, opts?: ToastOptions) => add("warning", title, opts),
    info: (title: React.ReactNode, opts?: ToastOptions) => add("info", title, opts),
    dismiss: (id?: string) => manager.close(id),
  }
)

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2Icon,
  error: XCircleIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
}

const TYPE_COLOR: Record<string, string> = {
  success: "text-ok",
  error: "text-destructive",
  warning: "text-warn",
  info: "text-muted-foreground",
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return (
    <>
      {toasts.map((t) => {
        const Icon = TYPE_ICON[t.type ?? ""]
        return (
          <ToastPrimitive.Root
            key={t.id}
            toast={t}
            className={cn(
              "pointer-events-auto flex w-80 items-start gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg",
              "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4"
            )}
          >
            {Icon && (
              <Icon className={cn("mt-0.5 size-4 shrink-0", TYPE_COLOR[t.type ?? ""])} />
            )}
            <div className="grid flex-1 gap-1">
              <ToastPrimitive.Title className="text-[13.5px] leading-snug font-medium" />
              <ToastPrimitive.Description className="text-[12.5px] leading-snug text-muted-foreground" />
            </div>
            <ToastPrimitive.Close
              aria-label="Close"
              className="rounded-xs opacity-60 transition-opacity hover:opacity-100"
            >
              <XIcon className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        )
      })}
    </>
  )
}

export function Toaster(_props: { position?: string }) {
  return (
    <ToastPrimitive.Provider toastManager={manager}>
      <ToastPrimitive.Portal container={getPortalContainer()}>
        <ToastPrimitive.Viewport className="pointer-events-none fixed right-4 bottom-4 z-60 flex flex-col items-end gap-2">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}

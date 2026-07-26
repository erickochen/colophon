import * as React from "react"

import { cn } from "@/lib/utils"

// Deterministic linen color for covers that never arrive.
export function bookSpineHue(title: string): number {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360
  return h
}

const SIZES = {
  mini: "w-full",
  row: "w-full",
  shelf: "w-full",
  hero: "w-full",
} as const

type BookProps = {
  poster: string | null
  title: string
  author?: string
  /** Natural image ratio (shelf, hero); false crops to the uniform 3/4.5 frame. */
  naturalRatio?: boolean
  size?: keyof typeof SIZES
  className?: string
}

/* The physical book: spine light strip, fore-edge, asymmetric radius and the
 * layered shadow. Block-level on purpose: transforms no-op on inline boxes. */
export function Book({ poster, title, author, naturalRatio = false, size = "row", className }: BookProps) {
  const [failed, setFailed] = React.useState(false)
  const showFallback = !poster || failed
  return (
    <span
      className={cn(
        "book relative block overflow-visible rounded-[4px_7px_7px_4px] bg-card shadow-book",
        "after:pointer-events-none after:absolute after:inset-0 after:z-2 after:rounded-[inherit]",
        "after:bg-[linear-gradient(90deg,oklch(0_0_0/0.22)_0,oklch(1_0_0/0.18)_5.5%,oklch(0_0_0/0.08)_9%,transparent_13%)]",
        "before:pointer-events-none before:absolute before:inset-y-px before:right-px before:z-2 before:w-[2.5px] before:rounded-r-[6px]",
        "before:bg-[repeating-linear-gradient(oklch(0.97_0.004_85),oklch(0.97_0.004_85)_1px,oklch(0.86_0.008_80)_1px,oklch(0.86_0.008_80)_2px)] before:opacity-85",
        SIZES[size],
        className
      )}
    >
      {showFallback ? (
        <span
          className="flex aspect-[3/4.5] w-full flex-col justify-between rounded-[inherit] p-[9%_8%_8%_14%] text-[oklch(0.97_0.005_85)]"
          style={{
            background: `linear-gradient(160deg, oklch(0.46 0.08 ${bookSpineHue(title)}), oklch(0.3 0.06 ${(bookSpineHue(title) + 12) % 360}))`,
          }}
        >
          <span className="font-display text-[0.95em] leading-tight text-balance">{title}</span>
          {author && (
            <span className="text-[0.7em] tracking-wide uppercase opacity-75">{author}</span>
          )}
        </span>
      ) : (
        <img
          src={poster}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn(
            "block w-full rounded-[inherit] object-cover dark:brightness-[.88]",
            naturalRatio ? "h-auto" : "aspect-[3/4.5]"
          )}
        />
      )}
    </span>
  )
}

/* Hero variant: perspective wrapper, flattens on hover. */
export function Book3D({ className, children, ...props }: BookProps & { children?: React.ReactNode }) {
  return (
    <span className={cn("block [perspective:1100px]", className)}>
      <Book
        {...props}
        size="hero"
        className="origin-left [transform:rotateY(-17deg)] shadow-book-lift transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:[transform:rotateY(-5deg)] motion-reduce:transition-none"
      />
      {children}
    </span>
  )
}

/* Ambient glow behind a hero cover: the same image blurred, fading out
 * horizontally. Masks must stay at 90deg or the fade leaves a hard edge. */
export function BookAmbilight({ poster, className }: { poster: string | null; className?: string }) {
  if (!poster) return null
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -inset-y-16 -left-16 z-0 w-[540px] scale-110 opacity-[.36] blur-[52px] saturate-100 dark:opacity-[.24]",
        "[mask-image:linear-gradient(90deg,oklch(0_0_0)_35%,transparent_88%)]",
        className
      )}
    >
      <img src={poster} alt="" className="size-full object-cover" />
    </span>
  )
}

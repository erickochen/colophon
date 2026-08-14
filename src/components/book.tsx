import * as React from "react"

import { COVER_ASPECT, type CoverShape } from "@/lib/cover-shape"
import { cn } from "@/lib/utils"

// Deterministic linen color for covers that never arrive.
export function bookSpineHue(title: string): number {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360
  return h
}

// The fallback picks its text treatment by slot size; no classes hang off this.
type BookSize = "mini" | "row" | "shelf" | "hero"

type BookProps = {
  /** One URL. A list is tried in order where the poster format is unknown. */
  poster: string | string[] | null
  title: string
  author?: string
  /** Reserves the shape before the image lands; the loaded image corrects it. */
  shape?: CoverShape
  /** Stands the cover in a frame of this shape, resting on its floor. A row of
   * frames lines up whatever shapes the covers turn out to be. */
  frame?: CoverShape
  /** Sizes the frame. Ignored where no frame is asked for. */
  frameClassName?: string
  /** Skip the spine and fore-edge; small covers keep their detail this way. */
  plain?: boolean
  size?: BookSize
  className?: string
  style?: React.CSSProperties
  /** Badges that belong on the cover rather than on the frame around it. */
  children?: React.ReactNode
}

/* The physical book: spine light strip, fore-edge, asymmetric radius and the
 * layered shadow. Block-level on purpose: transforms no-op on inline boxes. */
export function Book({ poster, title, author, shape = "portrait", frame, frameClassName, plain = false, size = "row", className, style, children }: BookProps) {
  const candidates = Array.isArray(poster) ? poster : poster ? [poster] : []
  const trail = candidates.join("|")
  // The walk position belongs to this poster, so it is compared during render
  // rather than reset in an effect: a new poster would otherwise be indexed
  // with the previous position for one render, skipping its first candidate.
  const [walk, setWalk] = React.useState({ trail, at: 0 })
  const at = walk.trail === trail ? walk.at : 0
  const [measured, setMeasured] = React.useState<{ w: number; h: number } | null>(null)
  const src = candidates[at] ?? null
  const showFallback = src == null
  // The measured image corrects the reserved guess, for the frame and for the
  // treatment both. The physical book only makes sense on a portrait cover;
  // square and landscape art gets the flat sleeve.
  const measuredShape: CoverShape | null = measured ? (measured.w < measured.h ? "portrait" : "square") : null
  const bookish = !plain && (measuredShape ?? shape) === "portrait"
  const aspect = measured ? measured.w / measured.h : COVER_ASPECT[shape]
  // Inside a frame the cover keeps its own proportions and gives up whichever
  // axis runs out first, so nothing is ever cropped to fit.
  const share = frame ? Math.min(1, aspect / COVER_ASPECT[frame]) : 1
  const cover = (
    <span
      style={{ ...style, aspectRatio: String(aspect), ...(frame ? { width: `${share * 100}%` } : null) }}
      className={cn(
        "book relative block overflow-visible bg-card",
        !frame && "w-full",
        bookish
          ? cn(
              "rounded-[4px_7px_7px_4px] shadow-book",
              "after:pointer-events-none after:absolute after:inset-0 after:z-2 after:rounded-[inherit]",
              "after:bg-[linear-gradient(90deg,oklch(0_0_0/0.22)_0,oklch(1_0_0/0.18)_5.5%,oklch(0_0_0/0.08)_9%,transparent_13%)]",
              "before:pointer-events-none before:absolute before:inset-y-px before:right-px before:z-2 before:w-[2.5px] before:rounded-r-[6px]",
              "before:bg-[repeating-linear-gradient(oklch(0.97_0.004_85),oklch(0.97_0.004_85)_1px,oklch(0.86_0.008_80)_1px,oklch(0.86_0.008_80)_2px)] before:opacity-85"
            )
          : "rounded-md shadow-[0_0_0_1px_oklch(from_var(--foreground)_l_c_h/0.07),0_2px_6px_-1px_oklch(0.2_0.02_50/0.2)]",
        className
      )}
    >
      {showFallback ? (
        /* Clipped, so the frame holds its reserved ratio at any title length. */
        <span
          className={cn(
            "flex size-full flex-col justify-between overflow-hidden rounded-[inherit] text-[oklch(0.97_0.005_85)]",
            bookish ? "p-[9%_8%_8%_14%]" : "p-[9%_8%]"
          )}
          style={{
            background: `linear-gradient(160deg, oklch(0.46 0.08 ${bookSpineHue(title)}), oklch(0.3 0.06 ${(bookSpineHue(title) + 12) % 360}))`,
          }}
        >
          {size === "mini" ? (
            /* Too narrow to read a title, so it gets a blind-stamped band. */
            <span aria-hidden className="mt-[18%] block h-px w-full bg-current opacity-30 shadow-[0_4px_0_-1px_currentColor]" />
          ) : (
            <>
              <span className="font-display line-clamp-4 text-[0.95em] leading-tight text-balance">{title}</span>
              {author && (
                <span className="line-clamp-2 text-[0.7em] tracking-wide uppercase opacity-75">{author}</span>
              )}
            </>
          )}
        </span>
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setWalk({ trail, at: at + 1 })}
          onLoad={(e) => {
            const im = e.currentTarget
            if (im.naturalWidth > 0 && im.naturalHeight > 0) {
              setMeasured({ w: im.naturalWidth, h: im.naturalHeight })
            }
          }}
          className="block size-full rounded-[inherit] object-contain dark:brightness-[.88]"
        />
      )}
      {children}
    </span>
  )
  if (!frame) return cover
  return (
    <span className={cn("relative flex items-end justify-center", frameClassName)} style={{ aspectRatio: String(COVER_ASPECT[frame]) }}>
      {cover}
    </span>
  )
}

/* Hero variant: rests face-on and tilts toward the cursor, the 3d-card
 * pattern. Inline transforms only, so it works inside the shadow root. */
export function Book3D({ className, children, ...props }: BookProps & { children?: React.ReactNode }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [tilt, setTilt] = React.useState<{ x: number; y: number } | null>(null)

  function onMove(e: React.PointerEvent) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ x: py * -13, y: px * 19 })
  }

  return (
    <span
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setTilt(null)}
      className={cn("block [perspective:1100px]", className)}
    >
      <Book
        {...props}
        size="hero"
        style={{
          transform: tilt ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.035)` : undefined,
          transition: tilt ? "transform 0.08s linear" : "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className="shadow-book-lift will-change-transform"
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
        "pointer-events-none absolute -inset-y-16 -left-16 z-0 w-[640px] scale-110 opacity-[.55] blur-[52px] saturate-100 dark:opacity-[.38]",
        "[mask-image:linear-gradient(90deg,oklch(0_0_0)_35%,transparent_88%)]",
        className
      )}
    >
      <img src={poster} alt="" className="size-full object-cover" />
    </span>
  )
}

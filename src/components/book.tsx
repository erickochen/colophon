import * as React from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { COVER_ASPECT, type CoverShape } from "@/lib/cover-shape"
import { cn } from "@/lib/utils"
import { Magnet } from "@/components/ui/magnet"
import { Tilt } from "@/components/ui/tilt"

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

// The side under the pointer dips away, the way a card presses down.
const HERO_TILT_DEGREES = 8
const HERO_TILT_SPRING = { stiffness: 260, damping: 26, mass: 0.8 }

/* Hero variant: rests face-on and tilts toward the cursor on a spring. */
export function Book3D({ className, children, ...props }: BookProps & { children?: React.ReactNode }) {
  return (
    <Tilt rotationFactor={HERO_TILT_DEGREES} isRevese springOptions={HERO_TILT_SPRING} className={cn("block", className)}>
      <Book {...props} size="hero" className="shadow-book-lift" />
      {children}
    </Tilt>
  )
}

// One breath of the glow: how long it takes and how far it swells.
const AMBILIGHT_BREATH_SECONDS = 8
const AMBILIGHT_BREATH_SCALE = 1.08
// How far the glow follows the pointer: the pointer offset divided by this.
const AMBILIGHT_MAGNET_STRENGTH = 12
// The glow blooms in over the same beat as the rest of the hero.
const AMBILIGHT_BLOOM_SECONDS = 0.9

/* Ambient glow behind a hero cover: the same image blurred across the whole
 * hero. It breathes while in view and drifts a little toward the pointer. */
export function BookAmbilight({ poster, className }: { poster: string | null; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref)
  const reduced = useReducedMotion()
  if (!poster) return null
  return (
    <motion.span
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: AMBILIGHT_BLOOM_SECONDS, ease: "easeOut" }}
    >
      <Magnet padding={0} magnetStrength={AMBILIGHT_MAGNET_STRENGTH} disabled={!!reduced} wrapperClassName="size-full align-top" innerClassName="size-full">
        <motion.span
          className="absolute -inset-16 block opacity-[.5] blur-[22px] saturate-[1.35] brightness-[1.2] dark:opacity-[.42] dark:brightness-100"
          animate={inView ? { scale: [1, AMBILIGHT_BREATH_SCALE, 1] } : { scale: 1 }}
          transition={{ repeat: Infinity, duration: AMBILIGHT_BREATH_SECONDS, ease: "linear", repeatType: "mirror" }}
        >
          <img src={poster} alt="" className="size-full object-cover" />
        </motion.span>
      </Magnet>
    </motion.span>
  )
}

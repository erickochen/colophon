import { useEffect, useState, type RefCallback } from 'react'

// Breathing room between a bar at the bottom and whatever floats above it.
const CLEARANCE_GAP_PX = 8

// Bars docked at the bottom of the viewport plus the controls floating above
// them. Each side clears the other.
const bars = new Set<HTMLElement>()
const floats = new Set<HTMLElement>()
const readers = new Set<() => void>()

function publish(): void {
  for (const read of readers) read()
}

/** Membership follows the element's own life, so a bar that mounts later than
 * its view still registers. A bar can also change height in place, which is why
 * its size is watched too. */
function attach(set: Set<HTMLElement>): RefCallback<HTMLElement> {
  return (el) => {
    if (!el) return
    set.add(el)
    const size = new ResizeObserver(publish)
    size.observe(el)
    publish()
    return () => {
      size.disconnect()
      set.delete(el)
      publish()
    }
  }
}

/** Put this on a bar that sits at the bottom of the viewport. */
export const bottomDockRef = attach(bars)

/** Put this on a control floating in the bottom corner, while it is on screen. */
export const bottomFloatRef = attach(floats)

/** Say that a registered element moved under its own steam, as a floating
 * control does when it steps above a bar. Its size never changed, so nothing
 * else would notice. */
export function dockMoved(): void {
  publish()
}

/** A bar rests wherever its page puts it, so where it is has to be looked up. */
function barLift(el: HTMLElement): number {
  const box = el.getBoundingClientRect()
  if (box.height === 0 || box.bottom <= 0 || box.top >= window.innerHeight) return 0
  return window.innerHeight - box.top + CLEARANCE_GAP_PX
}

/** A floating control settles into place with a transform, which a rect would
 * catch mid-flight, so its own offset from the bottom plus its height is used. */
function floatLift(el: HTMLElement): number {
  if (el.offsetHeight === 0) return 0
  const bottom = parseFloat(getComputedStyle(el).bottom) || 0
  return bottom + el.offsetHeight + CLEARANCE_GAP_PX
}

function useClearance(over: Set<HTMLElement>, lift: (el: HTMLElement) => number): number {
  const [, bump] = useState(0)

  useEffect(() => {
    const read = () => bump((n) => n + 1)
    readers.add(read)
    return () => {
      readers.delete(read)
    }
  }, [])

  let room = 0
  for (const el of over) room = Math.max(room, lift(el))
  return room
}

/** How far from the bottom a floating control belongs. A sticky bar comes to
 * rest wherever its page ends rather than on its sticky line, so the bar is
 * measured. Callers re-render on scroll, which is when a resting bar moves. */
export function useDockClearance(): number {
  return useClearance(bars, barLift)
}

/** How far from the bottom the toast lane belongs, so a floating control keeps
 * its corner. */
export function useFloatClearance(): number {
  return useClearance(floats, floatLift)
}

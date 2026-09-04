import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/** Our own text scale: text-12, text-12-5 and the rest of the steps in
 * index.css. A hyphen stands in for the half, since a dot in a theme key comes
 * out of the build as a selector no class can match. */
const isTextStep = (value: string) => /^\d+(-\d+)?$/.test(value)

/** tailwind-merge only knows the sizes it ships with, so without this a
 * caller's size ends up beside the one a component already carries plus the
 * later of the two wins. A size behind a modifier is a separate group either
 * way: md:text-sm keeps beating a plain size from md up. */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [isTextStep] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

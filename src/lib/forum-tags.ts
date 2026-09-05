// The state staff gives a topic on the boards that track one. It reaches us
// twice: bracketed before the title in a board list plus spelled out under the
// title of the topic itself, which is why both sides read it from here.

import type { BadgeTone } from '@/lib/snatch-status'

/** Badge tone for a state. MAM writes the wording, so only the color is a
 * guess: done carries one plus a state that waits on you warns. Whole boards
 * are tagged, so everything else stays quiet rather than tinting every row. */
export function tagTone(tag: string): BadgeTone {
  const t = tag.toLowerCase()
  if (/^implemented|^fixed/.test(t)) return 'ok'
  if (/required/.test(t)) return 'warn'
  return 'muted'
}

/** The word as the badge carries it. A board list capitalizes what the topic
 * page prints in lower case, so the first letter is lifted to keep one state
 * reading the same in both places. */
export function tagLabel(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1)
}

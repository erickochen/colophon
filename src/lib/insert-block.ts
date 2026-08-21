// Where a block of post source lands in plain BBCode: on lines of its own, so
// a quote dropped mid-sentence still reads as a quote.

/** Text before the caret that already ends on a blank line. */
const BLANK_LINE = /\n[ \t]*\n[ \t]*$/
/** Text before the caret that ends at the start of a line. */
const LINE_START = /\n[ \t]*$/

export interface Splice {
  text: string
  /** Where the caret goes afterwards: on the empty line below the block. */
  caret: number
}

/** Line breaks the text after the caret already opens with. */
const OPENING_BREAKS = /^[ \t]*\n[ \t]*\n?/

/** Puts `block` in at the caret. A position rather than a range, so a selection
 * the reader left behind is never written over. Both sides end up with exactly
 * one empty line, counting the breaks the text already brings. */
export function spliceBlock(value: string, at: number, block: string): Splice {
  const before = value.slice(0, at)
  const rest = value.slice(at)
  const lead = !before ? '' : BLANK_LINE.test(before) ? '' : LINE_START.test(before) ? '\n' : '\n\n'
  const carried = rest.match(OPENING_BREAKS)?.[0] ?? ''
  const tail = '\n'.repeat(Math.max(0, 2 - (carried.match(/\n/g)?.length ?? 0)))
  const head = before + lead + block + tail
  // Past the breaks either side wrote, so the caret sits on the empty line.
  return { text: head + rest, caret: head.length + carried.length }
}
